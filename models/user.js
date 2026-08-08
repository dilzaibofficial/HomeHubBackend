const mongoose = require("mongoose");

const userSchema = mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  cnic: {
    // Stored as String, not Number - CNIC/phone can carry leading zeros and
    // a "+" prefix, both of which a Number field silently strips/corrupts.
    type: String,
    required: true,
    unique: true,
  },
  bankAccount: {
    type: String,
    required: true,
  },
  BankAountStripeId: {
    type: String,
    default: null,
  },
  phonenumber: {
    type: String,
    required: true,
    unique: true,
  },
  propertyown: {
    type: Array,
    default: [],
  },
  CNICImageArray: {
    type: Array,
    default: [],
  },
  Verified: {
    type: Boolean,
    default: false,
  },
  Token : {
    type :String,
  },
  profileImage: {
    type: String,
    default: null,
  }

});

const User = mongoose.model("User", userSchema);

module.exports = User;
