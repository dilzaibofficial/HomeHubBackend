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
const { allUser, verifyUser, allAnalytics, creditData, allProperties } = require("../controller/admin");

router.route("/adminalluser").post(allUser);
router.route("/verifyUser").post(verifyUser);
router.route("/allAnalytics").post(allAnalytics);
router.route("/creditData").post(creditData);
router.route("/allProperties").post(allProperties);


module.exports = router;
