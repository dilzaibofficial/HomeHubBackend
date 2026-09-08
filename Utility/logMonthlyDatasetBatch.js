const VerificationSample = require("../models/VerificationSample");

// There is no existing "notify an admin" mechanism anywhere in this app
// (the Notification model only ever refs User, never Admin) - and the
// admin Dataset page already computes and shows the live, always-accurate
// unexported-sample count on every load (see controller/adminVerification.js
// datasetSummary). A monthly push would just be a less-reliable duplicate
// of what that page already shows truthfully at any moment, so this job is
// intentionally just an operator-visible log line in Render's dashboard,
// not a new notification pipe.
const logMonthlyDatasetSummary = async () => {
  try {
    const unexportedCount = await VerificationSample.countDocuments({ exportedAt: null });
    console.log(`[dataset] ${unexportedCount} verification sample(s) awaiting export`);
  } catch (error) {
    console.error("Error logging monthly dataset summary:", error);
  }
};

module.exports = logMonthlyDatasetSummary;
