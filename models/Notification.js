const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ["agreement_request", "negotiation", "handshake", "rejected", "payment", "agreement_pdf"],
      required: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
    },
    agreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agreement",
    },
    // Which section of the property screen to auto-scroll to on tap -
    // currently only 'negotiation', null just opens the property normally.
    scrollTo: { type: String, default: null },
    // True when this event is something the property OWNER needs to act on
    // (vs. the tenant/buyer side) - drives the separate "My Ads" badge count.
    forOwner: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
