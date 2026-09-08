const archiver = require("archiver");
const { requireAdmin } = require("./adminAuth");
const Property = require("../models/property");
const VerificationSample = require("../models/VerificationSample");
const { notifyUser } = require("./property");
const { deleteFromCloudinary } = require("../Utility/cloudinary");

const listPendingVerifications = async (req, res) => {
  try {
    requireAdmin(req);
    const properties = await Property.find({ verificationStatus: "pending_review" })
      .populate("propertyowner")
      .sort({ verificationSubmittedAt: -1 });
    res.status(200).json(properties);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

// Shared by approve/reject below - both are the same shape: atomically
// claim a still-pending property (409 if it's already been decided,
// mirroring the atomic-claim pattern makeAgreement/DealDone already use in
// controller/property.js for the same reason - protects against a double
// click submitting two decisions), label its VerificationSample rows, drop
// the now-unneeded video, and notify the owner.
const applyVerificationDecision = async (req, res, decision) => {
  try {
    requireAdmin(req);
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: "Property id is required" });

    // {new: false} deliberately returns the PRE-update document, so we
    // still have verificationVideoPublicId available to delete afterward -
    // the $set below already clears those fields in the same atomic write.
    const previous = await Property.findOneAndUpdate(
      { _id: id, verificationStatus: "pending_review" },
      {
        $set: {
          verificationStatus: decision.newStatus,
          verificationDecidedAt: new Date(),
          verificationDecisionSource: "admin",
          verificationVideoUrl: null,
          verificationVideoPublicId: null,
        },
      },
      { new: false }
    );

    if (!previous) {
      return res.status(409).json({ message: "This property is not currently awaiting verification review" });
    }

    if (previous.verificationVideoPublicId) {
      await deleteFromCloudinary(previous.verificationVideoPublicId, "video");
    }

    await VerificationSample.updateMany(
      { propertyId: previous._id, attemptId: previous.verificationAttemptId },
      { $set: { label: decision.label, labelSource: decision.labelSource } }
    );

    await notifyUser(previous.propertyowner, decision.notifTitle, decision.notifBody(previous), {
      type: "verification_result",
      propertyId: previous._id,
      forOwner: true,
    });

    res.status(200).json({ message: "Verification decision recorded" });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const approveVerification = (req, res) =>
  applyVerificationDecision(req, res, {
    newStatus: "verified",
    label: "match",
    labelSource: "admin_approve",
    notifTitle: "Property Verified!",
    notifBody: (property) => `Your property "${property.title}" has been verified by our team.`,
  });

const rejectVerification = (req, res) =>
  applyVerificationDecision(req, res, {
    newStatus: "rejected",
    label: "no_match",
    labelSource: "admin_reject",
    notifTitle: "Verification Rejected",
    notifBody: (property) =>
      `Your verification video for "${property.title}" was reviewed and rejected. Please retake it and try again.`,
  });

const datasetSummary = async (req, res) => {
  try {
    requireAdmin(req);
    const unexportedCount = await VerificationSample.countDocuments({ exportedAt: null, label: { $ne: null } });
    res.status(200).json({ unexportedCount });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

// Streams a zip directly to the response (not buffered in memory first,
// unlike getAgreementPdf's small-PDF approach in controller/property.js) -
// a dataset zip of many images could be sizeable, so streaming keeps
// memory use flat regardless of how many samples are included.
const exportDatasetZip = async (req, res) => {
  try {
    requireAdmin(req);

    const samples = await VerificationSample.find({ exportedAt: null, label: { $ne: null } });
    if (samples.length === 0) {
      return res.status(200).json({ message: "No new labeled samples to export yet" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="homehub_verification_dataset_${new Date().toISOString().slice(0, 10)}.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    const manifest = [];
    for (const sample of samples) {
      const folder = sample.label === "match" ? "match" : "no_match";
      manifest.push({
        id: sample._id.toString(),
        propertyId: sample.propertyId.toString(),
        label: sample.label,
        labelSource: sample.labelSource,
        score: sample.score,
        createdAt: sample.createdAt,
      });

      try {
        const [photoRes, frameRes] = await Promise.all([
          fetch(sample.referencePhotoUrl),
          fetch(sample.matchedFrameUrl),
        ]);
        if (photoRes.ok) {
          archive.append(Buffer.from(await photoRes.arrayBuffer()), {
            name: `${folder}/${sample._id}_photo.jpg`,
          });
        }
        if (frameRes.ok) {
          archive.append(Buffer.from(await frameRes.arrayBuffer()), {
            name: `${folder}/${sample._id}_frame.jpg`,
          });
        }
      } catch (fetchError) {
        console.error(`Error fetching sample ${sample._id} for dataset export:`, fetchError);
      }
    }

    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

    // Only mark samples exported once the archive has actually finished
    // streaming to the client. Known, accepted tradeoff: if the admin's
    // connection drops mid-download after this fires, that batch is lost
    // from the "unexported" pool - acceptable for a low-stakes internal
    // monthly flow, recoverable manually via Mongo if it ever happens.
    await new Promise((resolve, reject) => {
      archive.on("end", resolve);
      archive.on("error", reject);
      archive.finalize();
    });

    await VerificationSample.updateMany(
      { _id: { $in: samples.map((s) => s._id) } },
      { $set: { exportedAt: new Date() } }
    );
  } catch (error) {
    console.error("Error exporting verification dataset:", error);
    if (!res.headersSent) {
      res.status(error.status || 500).json({ message: error.message || "Server error" });
    } else {
      res.end();
    }
  }
};

module.exports = {
  listPendingVerifications,
  approveVerification,
  rejectVerification,
  datasetSummary,
  exportDatasetZip,
};
