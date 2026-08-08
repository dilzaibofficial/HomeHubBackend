const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const cookieParser = require("cookie-parser");
app.use(cookieParser());
const cors = require("cors");
const { query, check, validationResult } = require("express-validator");
const User = require("../models/user");
const { allUser, verifyUser, allAnalytics, creditData, allProperties, fixStripeAccounts } = require("../controller/admin");
const {
  adminLogin,
  createAdmin,
  listAdmins,
  getStreamToken,
  adminEditUser,
  adminDeleteUser,
  unverifyUser,
  adminEditProperty,
  adminDeleteProperty,
} = require("../controller/adminAuth");

router.route("/adminalluser").post(allUser);
router.route("/verifyUser").post(verifyUser);
router.route("/allAnalytics").post(allAnalytics);
router.route("/creditData").post(creditData);
router.route("/allProperties").post(allProperties);
router.route("/fixStripeAccounts").post(fixStripeAccounts);

// Admin panel
router.route("/login").post(adminLogin);
router.route("/createAdmin").post(createAdmin);
router.route("/listAdmins").post(listAdmins);
router.route("/streamToken").post(getStreamToken);
router.route("/editUser").post(adminEditUser);
router.route("/deleteUser").post(adminDeleteUser);
router.route("/unverifyUser").post(unverifyUser);
router.route("/editProperty").post(adminEditProperty);
router.route("/deleteProperty").post(adminDeleteProperty);


module.exports = router;
