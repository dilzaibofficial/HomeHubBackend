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
const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/tmp"); // Destination folder for uploaded files
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + "." + file.mimetype.split("/")[1]
    );
  },
});

const upload = multer({ storage: storage });
app.use(
  cors({
    origin: "*",
  })
);
const { signIn, signUp, editProfile, logout, viewProfile, forgetPasswordSend, handleRepeatTokenSend, VerifyToken, forgetPasswordChange, changeForgetPassword, updateNotificationToken } = require("../controller/user");

function authenticateToken(req, res, next) {
  const authtoken = req.cookies.jwt;
  console.log(authtoken);
  if (authtoken) {
    jwt.verify(
      authtoken,
      process.env.ACCESS_TOKEN_SECRET,
      (err, decodedToken) => {
        if (err) {
          console.log(err.message);
          res.status(401).send({ error: "Unauthorizeds" });
        } else {
          req.officeHolder = decodedToken;
          next();
        }
      }
    );
  } else {
    res.status(401).send({ error: "Unauthorizeds" });
  }
}
router.route("/logout").post(logout);
router.route("/viewProfile").post(viewProfile);

router.route("/editProfile").post(upload.single("profileImage"), editProfile);
router.route("/signin").post(signIn);
router.route("/updateNotificationToken").post(updateNotificationToken);
router.post(
  "/signup",
  upload.array("images"),
  [
    check("email")
      .isEmail()
      .withMessage("Enter a valid email")
      .custom(async (value) => {
        const user = await User.findOne({ email: value });
        if (user) {
          return Promise.reject("Email already taken");
        }
      }),
    check("cnic")
      .not()
      .isEmpty()
      .withMessage("CNIC is required")
      .custom(async (value) => {
        const user = await User.findOne({ cnic: value });
        if (user) {
          return Promise.reject("CNIC already registered");
        }
      }),
    check("phonenumber")
      .not()
      .isEmpty()
      .withMessage("Phone number is required")
      .custom(async (value) => {
        const user = await User.findOne({ phonenumber: value });
        if (user) {
          return Promise.reject("Phone number already registered");
        }
      }),
  ],
  signUp
);


router.route("/SendRepeatToken").post(handleRepeatTokenSend);
router.route("/verifyToken").post(VerifyToken);
router.route("/forgetPasswordChange").post(forgetPasswordChange);
router.route("/forgetPasswordSend").post(forgetPasswordSend);
router.route("/changeForgetPassword").post(changeForgetPassword);

module.exports = router;
