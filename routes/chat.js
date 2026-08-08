const express = require("express");
const router = express.Router();
const { askChatbot } = require("../controller/chat");

// Intentionally no auth middleware - visitors can chat before signing up.
router.route("/ask").post(askChatbot);

module.exports = router;
