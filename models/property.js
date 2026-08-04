const mongoose = require("mongoose");

const propertySchema = mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  rented: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    required: true,
  },
  rent: {
    type: Number,
    required: true,
  },
  advance: {
    type: Number,
    required: true,
  },
  bachelor: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  area: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  assest: {
    type: Array,
    default: [],
  },
  bedroom: {
    type: Number,
    required: true,
  },
  bathroom: {
    type: Number,
    required: true,
  },
  coordinate: {
    type: Array,
  },
  areaofhouse: {
    type: Number,
    required: true,
  },

  peoplesharing: {
    type: Number,
    required: true,
  },
  propertyowner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: "true",
  },
  propertySelling: {
    agreement: {
      type: Boolean,
      default: false,
    },
    agreementMaker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    agreementIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agreement", // Updated to reference Property model
      },
    ],
    dealDoneDate: {
      type: Date,
      default: null,
    },
    resetDueAt: {
      type: Date,
      default: null,
    },
  },
});

const Property = mongoose.model("Property", propertySchema);

module.exports = Property;
