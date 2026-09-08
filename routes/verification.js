const express = require("express");
const router = express.Router();
const { videoUpload } = require("../middleware/videoUpload.middleware");
const { submitVerification } = require("../controller/verification");

router.route("/submit").post(videoUpload.single("video"), submitVerification);

module.exports = router;
