const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Property = require("../models/property");
const VerificationSample = require("../models/VerificationSample");
const { notifyUser } = require("./property");
const {
  uploadVideoOnCloudinary,
  uploadImageBufferOnCloudinary,
  deleteFromCloudinary,
} = require("../Utility/cloudinary");

const AUTO_VERIFY_THRESHOLD = Number(process.env.VERIFICATION_AUTO_VERIFY_THRESHOLD) || 0.8;
const AUTO_REJECT_THRESHOLD = Number(process.env.VERIFICATION_AUTO_REJECT_THRESHOLD) || 0.35;
const ML_SERVICE_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS) || 45000;

// Duplicates only the ownership-check portion of guardEditableProperty
// (controller/property.js), deliberately not that function itself - it
// also blocks on an active/completed agreement, which verification should
// NOT be blocked by (a property can still be verified while a deal is in
// progress). Reusing it unmodified, or adding a flag to it, both risked
// changing behavior for its two existing callers (editProperty/deleteProperty).
const assertOwnsProperty = async (propertyId, requesterId) => {
  const property = await Property.findById(propertyId);
  if (!property) {
    const err = new Error("Property not found");
    err.status = 404;
    throw err;
  }
  if (property.propertyowner.toString() !== requesterId) {
    const err = new Error("You can only verify your own property");
    err.status = 403;
    throw err;
  }
  return property;
};

const callMatchingService = async (property) => {
  const baseUrl = process.env.ML_VERIFICATION_SERVICE_URL;
  const secret = process.env.ML_VERIFICATION_SERVICE_SECRET;
  if (!baseUrl || !secret) {
    const err = new Error("Verification service is not configured");
    err.status = 500;
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_SERVICE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Secret": secret,
      },
      body: JSON.stringify({
        propertyId: property._id.toString(),
        videoUrl: property.verificationVideoUrl,
        referencePhotoUrls: property.assest,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Verification service error:", response.status, errBody);
      const err = new Error("Verification service could not process the video. Please try again.");
      err.status = 502;
      throw err;
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      const err = new Error("Verification service timed out. Please try again.");
      err.status = 504;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

// title/body copy for each outcome - kept in one place so the in-app
// notification and the direct API response always say the same thing.
const outcomeCopy = (status, property) => ({
  verified: {
    title: "Property Verified!",
    body: `Your property "${property.title}" has been automatically verified.`,
  },
  rejected: {
    title: "Verification Didn't Match",
    body: `The video for "${property.title}" didn't match your photos closely enough. Please retake it, filming the same areas slowly and steadily.`,
  },
  pending_review: {
    title: "Verification Under Review",
    body: `Your video for "${property.title}" needs a manual check - our team will review it shortly. You can also message support from Help & Support if it's urgent.`,
  },
}[status]);

const submitVerification = async (req, res) => {
  if (process.env.VERIFICATION_ENABLED === "false") {
    return res
      .status(503)
      .json({ message: "Property verification is temporarily unavailable. Please try again later." });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  let property;
  let uploadedVideo = null;

  try {
    const verify = jwt.verify(authHeader.split(" ")[1], process.env.ACCESS_TOKEN_SECRET);
    property = await assertOwnsProperty(req.body.propertyId, verify.response._id);

    if (!req.file) {
      return res.status(400).json({ message: "A video file is required" });
    }
    if (!property.assest || property.assest.length === 0) {
      return res.status(400).json({ message: "This property has no reference photos to verify against" });
    }
    if (property.verificationStatus === "pending_review") {
      return res
        .status(409)
        .json({ message: "A previous video is already awaiting admin review for this property" });
    }

    uploadedVideo = await uploadVideoOnCloudinary(req.file.path);
    if (!uploadedVideo) {
      return res.status(502).json({ message: "Could not upload the video. Please try again." });
    }

    const attemptId = new mongoose.Types.ObjectId();
    property.verificationSubmittedAt = new Date();
    property.verificationVideoUrl = uploadedVideo.secureUrl;
    property.verificationVideoPublicId = uploadedVideo.publicId;
    property.verificationAttemptId = attemptId;
    await property.save();

    let mlResult;
    try {
      mlResult = await callMatchingService(property);
    } catch (error) {
      // A technical failure (service down/cold-starting/timeout) is not the
      // same as "the user's video didn't match" - roll back to a clean
      // unverified state and delete the video we just uploaded, so the
      // user isn't punished for our own outage and can simply retry.
      await deleteFromCloudinary(uploadedVideo.publicId, "video");
      property.verificationStatus = "unverified";
      property.verificationVideoUrl = null;
      property.verificationVideoPublicId = null;
      property.verificationSubmittedAt = null;
      await property.save();
      return res.status(error.status || 502).json({
        message: error.message || "Verification service is unavailable. Please try again shortly.",
      });
    }

    const score = typeof mlResult.aggregateScore === "number" ? mlResult.aggregateScore : 0;
    let status;
    let labelSource;
    if (score >= AUTO_VERIFY_THRESHOLD) {
      status = "verified";
      labelSource = "auto_verify";
    } else if (score <= AUTO_REJECT_THRESHOLD) {
      status = "rejected";
      labelSource = "auto_reject";
    } else {
      status = "pending_review";
      labelSource = null; // filled in later once an admin decides
    }

    // Persist a labeled sample per reference photo for the internal
    // dataset. One bad frame upload must never block the core decision
    // from reaching the user, so this runs best-effort via allSettled.
    const perPhoto = Array.isArray(mlResult.perPhoto) ? mlResult.perPhoto : [];
    await Promise.allSettled(
      perPhoto.map(async (entry) => {
        if (!entry || !entry.matchedFrameBase64) return;
        const uploadedFrame = await uploadImageBufferOnCloudinary(
          entry.matchedFrameBase64,
          `verification_samples/${property._id}`
        );
        if (!uploadedFrame) return;
        await VerificationSample.create({
          propertyId: property._id,
          attemptId,
          referencePhotoUrl: entry.referencePhotoUrl,
          matchedFrameUrl: uploadedFrame.secureUrl,
          matchedFramePublicId: uploadedFrame.publicId,
          score: entry.score,
          label: status === "verified" ? "match" : status === "rejected" ? "no_match" : null,
          labelSource,
        });
      })
    );

    property.verificationStatus = status;
    property.verificationScore = score;
    property.verificationDecidedAt = status === "pending_review" ? null : new Date();
    property.verificationDecisionSource = status === "pending_review" ? null : "auto";

    if (status !== "pending_review") {
      // Auto-decided (verified or rejected) - no reason to keep the video
      // around any longer than it took to score it.
      await deleteFromCloudinary(uploadedVideo.publicId, "video");
      property.verificationVideoUrl = null;
      property.verificationVideoPublicId = null;
    }
    // else (pending_review): keep the video fields populated for the admin review UI.

    await property.save();

    const copy = outcomeCopy(status, property);
    await notifyUser(property.propertyowner, copy.title, copy.body, {
      type: "verification_result",
      propertyId: property._id,
      forOwner: true,
    });

    return res.status(200).json({ status, score, message: copy.body });
  } catch (error) {
    console.error("Error submitting verification:", error);
    return res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

module.exports = { submitVerification };
