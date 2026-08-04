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
    type: Number,
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
    type: Number,
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
  }
  
});

const User = mongoose.model("User", userSchema);

module.exports = User;
