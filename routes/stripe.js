const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const cookieParser = require("cookie-parser");
app.use(cookieParser());
const cors = require("cors");

app.use(
  cors({
    origin: "*",
  })
);
const { payment, getPaymentInfo } = require("../controller/stripe");

router.route("/intents").post(payment);
router.route("/getpaymentInfo").post(getPaymentInfo);

module.exports = router;
