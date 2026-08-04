const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const app = express();
const cookieParser = require("cookie-parser");
app.use(cookieParser());
const cors = require("cors");
const { CreatePayment, UpdateEscrow, getTransactionsById } = require("../controller/credit");

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

router.route("/createPayment").post(CreatePayment);
router.route("/updateEscrow").post(UpdateEscrow);
router.route("/getTransaction").post(getTransactionsById);

module.exports = router;
