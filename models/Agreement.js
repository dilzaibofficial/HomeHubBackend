const mongoose = require("mongoose");

const agreementSchema = mongoose.Schema({
  PropertyId: {
    type: String,
    required: true,
  },

  buyerId: {
    type: String,
    required: true,
  },
  agreementPricePaid: {
    type: String,
    required: true,
  },
  negotationPrice: {
    type: Number,
    default: null,
  },
  agreementOwner: {
    type: Boolean,
    default: false,
  },
  agreementBuyer: {
    type: Boolean,
    default: false,
  },
  priceTransferDate: {
    type: Date,
    default: null,
  },
  AgreementMaking: {
    type: Date,
    default: null,
  },
  agreementSuccess: {
    type: Boolean,
    default: null,
  },
});

const Agreement = mongoose.model("Agreement", agreementSchema);

module.exports = Agreement;
