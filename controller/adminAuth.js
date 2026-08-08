require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { StreamChat } = require("stream-chat");
const Admin = require("../models/Admin");
const User = require("../models/user");
const Property = require("../models/property");

const streamServerClient = StreamChat.getInstance(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET
);

// Every admin-only route starts with this - verifies the JWT and confirms
// it's an *admin* token, not a regular user token (they're structurally
// different: {admin: {...}} vs {response: {...}}), so a normal user's
// token can never be replayed against admin routes.
function requireAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    const err = new Error("Authorization header missing");
    err.status = 401;
    throw err;
  }
  const decoded = jwt.verify(authHeader.split(" ")[1], process.env.ACCESS_TOKEN_SECRET);
  if (!decoded.admin) {
    const err = new Error("Admin access required");
    err.status = 403;
    throw err;
  }
  return decoded.admin;
}

// Idempotent - called once at server startup so a fresh database always
// has a working admin login (username: admin, password: admin) without
// any manual seeding step.
const ensureDefaultAdmin = async () => {
  try {
    const existing = await Admin.findOne({ username: "admin" });
    if (existing) return;
    const hashed = await bcrypt.hash("admin", 10);
    await Admin.create({ username: "admin", password: hashed });
    console.log("Seeded default admin (username: admin, password: admin)");
  } catch (error) {
    console.error("Error seeding default admin:", error);
  }
};

const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(404).json({ message: "Invalid username or password" });
    }

    const matches = await bcrypt.compare(password, admin.password);
    if (!matches) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const accessToken = jwt.sign(
      { admin: { _id: admin._id, username: admin.username } },
      process.env.ACCESS_TOKEN_SECRET
    );

    res.status(200).json({
      accessToken,
      admin: { _id: admin._id, username: admin.username },
    });
  } catch (error) {
    console.error("Error in adminLogin:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const createAdmin = async (req, res) => {
  try {
    const requester = requireAdmin(req);
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    if (password.length < 4) {
      return res.status(400).json({ message: "Password must be at least 4 characters" });
    }

    const existing = await Admin.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: "That username is already taken" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newAdmin = await Admin.create({
      username,
      password: hashed,
      createdBy: requester._id,
    });

    res.status(201).json({
      message: "Admin created successfully",
      admin: { _id: newAdmin._id, username: newAdmin.username },
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const listAdmins = async (req, res) => {
  try {
    requireAdmin(req);
    const admins = await Admin.find().select("-password").sort({ createdAt: -1 });
    res.status(200).json(admins);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

// A Stream Chat user token for the fixed HomeHub support identity - the
// mobile app's "Help & Support" already creates channels naming this same
// id (see Profile.jsx), so once the panel connects as this user it sees
// every support conversation automatically via Stream's own channel list,
// no extra backend endpoint needed for that part.
const getStreamToken = async (req, res) => {
  try {
    requireAdmin(req);
    const adminUserId = process.env.ADMIN_STREAM_USER_ID;
    await streamServerClient.upsertUser({
      id: adminUserId,
      name: "HomeHub Support",
      image: "https://admin-eta-three-41.vercel.app/logo.png",
    });
    const token = streamServerClient.createToken(adminUserId);
    res.status(200).json({ token, userId: adminUserId, apiKey: process.env.STREAM_API_KEY });
  } catch (error) {
    console.error("Error creating Stream token:", error);
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const adminEditUser = async (req, res) => {
  try {
    requireAdmin(req);
    const { id, ...fields } = req.body;
    if (!id) return res.status(400).json({ message: "User id is required" });

    const editable = ["username", "email", "phonenumber", "cnic", "bankAccount", "Verified"];
    const update = {};
    for (const field of editable) {
      if (fields[field] !== undefined) update[field] = fields[field];
    }

    const user = await User.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const adminDeleteUser = async (req, res) => {
  try {
    requireAdmin(req);
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: "User id is required" });

    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const unverifyUser = async (req, res) => {
  try {
    requireAdmin(req);
    const { id } = req.body;
    const user = await User.findByIdAndUpdate(id, { Verified: false }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ message: "User unverified", user });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const adminEditProperty = async (req, res) => {
  try {
    requireAdmin(req);
    const { id, ...fields } = req.body;
    if (!id) return res.status(400).json({ message: "Property id is required" });

    const editable = [
      "title", "description", "rent", "advance", "bedroom",
      "bathroom", "areaofhouse", "peoplesharing", "address", "bachelor", "rented",
    ];
    const update = {};
    for (const field of editable) {
      if (fields[field] !== undefined) update[field] = fields[field];
    }

    const property = await Property.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!property) return res.status(404).json({ message: "Property not found" });

    res.status(200).json({ message: "Property updated successfully", property });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const adminDeleteProperty = async (req, res) => {
  try {
    requireAdmin(req);
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: "Property id is required" });

    const property = await Property.findByIdAndDelete(id);
    if (!property) return res.status(404).json({ message: "Property not found" });

    res.status(200).json({ message: "Property deleted successfully" });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

module.exports = {
  ensureDefaultAdmin,
  adminLogin,
  createAdmin,
  listAdmins,
  getStreamToken,
  adminEditUser,
  adminDeleteUser,
  unverifyUser,
  adminEditProperty,
  adminDeleteProperty,
};
