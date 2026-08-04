const Property = require("../models/property");
const Agreement = require("../models/Agreement");

// Persisted, restart-safe replacement for the old per-request in-memory
// cron.schedule() call: instead of scheduling one JS timer per DealDone
// (which is lost forever if the server restarts within the 30-day window),
// the due date is stored on the Property document and this single
// recurring job sweeps for anything past due.
const resetExpiredAgreements = async () => {
  try {
    const now = new Date();
    const expiredProperties = await Property.find({
      "propertySelling.resetDueAt": { $ne: null, $lte: now },
    });

    for (const property of expiredProperties) {
      const agreementIds = property.propertySelling.agreementIds || [];
      const lastAgreementId = agreementIds[agreementIds.length - 1];

      property.rented = false;
      property.propertySelling.agreement = false;
      property.propertySelling.agreementMaker = null;
      property.propertySelling.dealDoneDate = null;
      property.propertySelling.resetDueAt = null;
      await property.save();

      if (lastAgreementId) {
        await Agreement.findByIdAndUpdate(lastAgreementId, {
          $set: { agreementSuccess: false },
        });
      }

      console.log(`Agreement expired and reset for property ${property._id}`);
    }
  } catch (error) {
    console.error("Error resetting expired agreements:", error);
  }
};

module.exports = resetExpiredAgreements;
