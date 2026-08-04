const User = require("../models/user");
const { query, check, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const Property = require("../models/property");
const Credit = require("../models/Credit");
const Agreement = require("../models/Agreement");

const allUser = async (req, res) => {
  try {
    const users = await User.find(); // Fetch all users from the database
    res.status(200).json(users);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const verifyUser = async (req, res) => {
  try {
    // Assume the user id is sent as a URL parameter, e.g., /verify/:id
    const { id } = req.body;
    console.log(id);

    // Retrieve the user by id
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Set the verified field to true
    user.Verified = true; // or user.verified = true, depending on your schema

    // Save the updated user
    await user.save();

    // Send a success response
    res.status(200).json({ message: "User verified successfully", user });
  } catch (error) {
    console.error("Error verifying user:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const allAnalytics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProperty = await Property.countDocuments();
    const totalCredit = await Credit.countDocuments();
    const totalAgreement = await Agreement.countDocuments();

    res
      .status(200)
      .json({ totalUsers, totalProperty, totalCredit, totalAgreement });
  } catch (error) {
    console.error("Error verifying user:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const creditData = async (req, res) => {
  try {
    // Assuming you have a Mongoose model named 'Credit'
    const data = await Credit.find({})
      .populate("SendedId") // Populates sender field with user details
      .populate("RecieverId") // Populates receiver field with user details
      .populate("InAccordancePropertyId");
    res.status(200).json({ data });
  } catch (error) {
    console.error("Error retrieving credit data:", error);
    res.status(500).json({ message: "Error retrieving credit data", error });
  }
};

const allProperties = async (req, res) => {
  try {
    // Fetch all properties and populate the propertyOwner field
    const properties = await Property.find().populate("propertyowner"); // Replace 'propertyOwner' with the actual field name in the Property model that references the User

    res.status(200).json(properties);
  } catch (error) {
    console.error("Error retrieving properties:", error);
    res.status(500).json({ message: "Error retrieving properties", error });
  }
};

module.exports = {
  allProperties,
  allUser,
  verifyUser,
  allAnalytics,
  creditData,
};
