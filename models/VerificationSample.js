const mongoose = require("mongoose");

// One row per (reference photo, matched video frame) pair produced by a
// verification attempt. Accumulates over time into an internal, labeled
// dataset the admin can export - see controller/adminVerification.js
// exportDatasetZip. Never stores the raw video, only small extracted
// frame images, so long-term storage stays cheap.
const verificationSampleSchema = new mongoose.Schema(
  {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    referencePhotoUrl: {
      type: String,
      required: true,
    },
    matchedFrameUrl: {
      type: String,
      required: true,
    },
    matchedFramePublicId: {
      type: String,
      default: null,
    },
    score: {
      type: Number,
      required: true,
    },
    // null until an admin decides a "pending_review" case; pre-filled
    // immediately for the two auto-decided tiers.
    label: {
      type: String,
      enum: ["match", "no_match", null],
      default: null,
    },
    // null until label is null: the two auto-decided tiers set both label
    // and labelSource together at creation; the "pending_review" tier
    // creates the row with both null, then an admin approve/reject fills
    // both in later (see controller/adminVerification.js).
    labelSource: {
      type: String,
      enum: ["auto_verify", "auto_reject", "admin_approve", "admin_reject", null],
      default: null,
    },
    // Set once this sample has been included in a downloaded dataset zip -
    // lets the next export only pick up what's new.
    exportedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VerificationSample", verificationSampleSchema);
