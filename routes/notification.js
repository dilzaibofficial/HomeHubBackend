const express = require("express");
const {
  sendNotification,
  createNotification,
} = require("../controller/notification");
const router = express.Router();



router.route("/create-notification").post(createNotification);
router.post("/send-notification", async (req, res) => {
  const { token, title, body } = req.body;
  try {
    const result = await sendNotification(token, title, body);
    res.json({
      success: true,
      message: "Notification sent successfully",
      result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
