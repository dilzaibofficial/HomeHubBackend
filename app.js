const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const cron = require("node-cron");
const connectDB = require("./database/connect");
const bodyParser = require("body-parser");
const resetExpiredAgreements = require("./Utility/resetExpiredAgreements");
const logMonthlyDatasetSummary = require("./Utility/logMonthlyDatasetBatch");
const { ensureDefaultAdmin } = require("./controller/adminAuth");
const { wakeVerificationService } = require("./Utility/verificationServiceWarmup");

const app = express();
// Render assigns its own port via process.env.PORT - it must be used as-is.
const PORT = process.env.PORT || 2000;

// Body Parser Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// CORS Middleware - Ye mobile app se connection ke liye zaroori hai
app.use(
  cors({
    origin: "*", 
    credentials: true,
  })
);

// Routes Import
const user_routes = require("./routes/user");
const property_routes = require("./routes/property");
const stripe_routes = require("./routes/stripe");
const credit_routes = require("./routes/credit");
const admin_routes = require("./routes/admin");
const notification_routes = require("./routes/notification");
const chat_routes = require("./routes/chat");
const verification_routes = require("./routes/verification");

// Base Route
app.get("/", (req, res) => {
  res.send("Welcome to anonymous app - Backend is Live!");
});

// Whenever the app talks to this backend, make sure the separately-hosted
// verification service is awake too (it sleeps independently on Render's
// free tier). Fire-and-forget and debounced - never delays or fails the
// actual request. See Utility/verificationServiceWarmup.js.
app.use("/api", (req, res, next) => {
  wakeVerificationService();
  next();
});

// Routes Middleware
app.use("/api/user", user_routes);
app.use("/api/property", property_routes);
app.use("/api/stripe", stripe_routes);
app.use("/api/credit", credit_routes);
app.use("/api/admin", admin_routes);
app.use("/api/notification", notification_routes);
app.use("/api/chat", chat_routes);
app.use("/api/verification", verification_routes);

// Server Start Function
const start = async () => {
  try {
    // Database Connection
    await connectDB();
    console.log("✅ Database Connected Successfully");

    // Idempotent - creates the default admin login (admin/admin) only if
    // no admin exists yet.
    await ensureDefaultAdmin();

    // Sweep for agreements past their 30-day reset date. Runs once at
    // startup (to catch anything that expired while the server was down)
    // then every 30 minutes.
    resetExpiredAgreements();
    cron.schedule("*/30 * * * *", resetExpiredAgreements);

    // Operator-visible log of how many labeled verification samples are
    // ready to export - runs once at startup, then on the 1st of each month.
    logMonthlyDatasetSummary();
    cron.schedule("0 0 1 * *", logMonthlyDatasetSummary);

    // This backend just booted (usually because someone opened the app after
    // it had been idle) - start the verification service booting too instead
    // of waiting for the first API request to do it.
    wakeVerificationService();

    // Listen on 0.0.0.0 to allow external (Mobile) requests
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server is running on Port: ${PORT}`);
      console.log(`🔗 Local Access: http://localhost:${PORT}`);
      console.log(`📱 Network Access: Check your laptop IP (e.g., http://172.20.177.5:${PORT})`);
    });
    
  } catch (error) {
    console.log("❌ Server Error:", error);
  }
};

start();