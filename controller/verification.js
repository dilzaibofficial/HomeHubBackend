const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Property = require("../models/property");
const VerificationSample = require("../models/VerificationSample");
const { notifyUser } = require("./property");
const { waitUntilVerificationServiceReady } = require("../Utility/verificationServiceWarmup");
const {
  uploadVideoOnCloudinary,
  uploadImageBufferOnCloudinary,
  deleteFromCloudinary,
} = require("../Utility/cloudinary");

const AUTO_VERIFY_THRESHOLD = Number(process.env.VERIFICATION_AUTO_VERIFY_THRESHOLD) || 0.8;
const AUTO_REJECT_THRESHOLD = Number(process.env.VERIFICATION_AUTO_REJECT_THRESHOLD) || 0.35;
// Measured against the live Render free-tier service (0.1 CPU): a /verify
// call takes ~35s for a short clip with 6 photos, and considerably longer
// for a typical 20-30s phone video. The old 45s cap aborted those even
// though the service was healthy, and then the retry piled a second copy of
// the same job onto the same tiny CPU. Deliberately a new env var name so a
// stale ML_SERVICE_TIMEOUT_MS=45000 already set on Render doesn't keep
// applying.
const ML_SERVICE_TIMEOUT_MS = Number(process.env.ML_VERIFY_TIMEOUT_MS) || 120000;
// The mobile app gives up on this request after 150s in total, and part of
// that is already spent uploading the video before this handler even runs -
// so the whole call to the service (wake-up wait included) is capped well
// under that, to always answer with a clean message instead of leaving the
// app hanging on a dead connection.
const VERIFY_BUDGET_MS = 110000;
const MIN_ATTEMPT_MS = 20000;

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// On Render's free tier, a cold/sleeping instance makes the platform's own
// edge return a fast 502/503 (before the container has even started up),
// well before it actually finishes booting - a single attempt reads that as
// "the service failed" when really it just needs a few more seconds. This
// retries specifically on those "still waking up" signals (and on a request
// timing out, since a slow cold boot can also just hang past the per-attempt
// budget) with a short delay, so a request made right after idle self-heals
// instead of forcing the user to manually retry.
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

const callMatchingServiceOnce = async (property, timeoutMs) => {
  const baseUrl = process.env.ML_VERIFICATION_SERVICE_URL;
  const secret = process.env.ML_VERIFICATION_SERVICE_SECRET;
  if (!baseUrl || !secret) {
    const err = new Error("Verification service is not configured");
    err.status = 500;
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
      err.status = response.status;
      err.retryable = RETRYABLE_STATUSES.has(response.status);
      throw err;
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      const err = new Error("Verification service timed out. Please try again.");
      err.status = 504;
      err.retryable = true;
      throw err;
    }
    if (error.retryable === undefined) {
      // A network-level failure (DNS, connection refused, etc.) - also
      // worth one retry, since a cold instance can briefly refuse
      // connections before its edge is ready to proxy at all.
      error.retryable = true;
      error.status = error.status || 502;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const callMatchingService = async (property, deadline) => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (attempt > 1 && remaining < MIN_ATTEMPT_MS) break; // no time left for a meaningful retry
    try {
      return await callMatchingServiceOnce(
        property,
        Math.min(ML_SERVICE_TIMEOUT_MS, Math.max(remaining, MIN_ATTEMPT_MS))
      );
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt === MAX_ATTEMPTS) break;
      console.warn(
        `Verification service attempt ${attempt}/${MAX_ATTEMPTS} failed (likely cold-starting), retrying in ${RETRY_DELAY_MS}ms:`,
        error.message
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
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

  const handlerStartedAt = Date.now();
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

    // Start waking the matching service (if it has gone to sleep) right now,
    // in parallel with the Cloudinary upload below, so its cold boot overlaps
    // with work we have to do anyway. Never rejects; awaited just before the
    // service is actually called.
    const matchingServiceReady = waitUntilVerificationServiceReady();

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
      await matchingServiceReady;
      mlResult = await callMatchingService(property, handlerStartedAt + VERIFY_BUDGET_MS);
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
