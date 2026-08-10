const admin = require("firebase-admin");
const { google } = require("googleapis");
const path = require("path");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Notification = require("../models/Notification");

// Initialize Firebase Admin SDK
const firebaseConfig = path.join(__dirname, "../firebaseToken.json");
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
});

// Function to send a notification to a device
async function sendNotification(token, title, body) {
  const message = {
    notification: {
      title,
      body,
    },
    android: {
      priority: "high",
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: "default",
          contentAvailable: true,
        },
      },
    },
    token,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Notification sent successfully:", response);
    return response;
  } catch (error) {
    console.error("Error sending notification:", error);
    throw error;
  }
}

// Function to get an access token using Google OAuth2
async function getAccessToken() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, "../../firebaseToken.json"), // path to the service account key
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  try {
    const accessToken = await auth.getAccessToken();
    console.log("Access Token:", accessToken);
    return accessToken;
  } catch (error) {
    console.error("Error fetching access token:", error);
    throw error;
  }
}

  async function createNotification(req, res) {
    const { id, title, description } = req.body;
    console.log("meaning" , req.body)
    if (!id || !title || !description) {
      return res.status(400).send({ message: "Missing required fields." });
    }

    try {
      // Find the user by ID in the database and get their token
      const user = await User.findById(id);

      if (!user || !user.Token) {
        return res.status(404).send({ message: "User or token not found." });
      }

      const token = user.Token;

      // Call the sendNotification function
      const notificationResponse = await sendNotification(
        token,
        title,
        description
      );

      // Return success response
      return res
        .status(200)
        .send({
          message: "Notification sent successfully.",
          data: notificationResponse,
        });
    } catch (error) {
      console.error("Error in createNotification:", error);
      return res.status(500).send({ message: "Error sending notification." });
    }
  }

// In-app notifications list (bell icon / notifications screen), separate
// from the FCM push helpers above - these read/write the persisted
// Notification collection so the list survives even if a push never
// reached the device (app closed, token stale, etc).
function getUserIdFromAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    const err = new Error("Authorization header missing");
    err.status = 401;
    throw err;
  }
  const decoded = jwt.verify(authHeader.split(" ")[1], process.env.ACCESS_TOKEN_SECRET);
  return decoded.response._id;
}

async function listNotifications(req, res) {
  try {
    const userId = getUserIdFromAuth(req);
    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate({ path: "property", populate: { path: "propertyowner" } });
    res.status(200).json(notifications);
  } catch (error) {
    console.error("Error listing notifications:", error);
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
}

async function unreadCount(req, res) {
  try {
    const userId = getUserIdFromAuth(req);
    const [count, ownerCount] = await Promise.all([
      Notification.countDocuments({ recipient: userId, read: false }),
      Notification.countDocuments({ recipient: userId, read: false, forOwner: true }),
    ]);
    res.status(200).json({ count, ownerCount });
  } catch (error) {
    console.error("Error getting unread notification count:", error);
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
}

async function markRead(req, res) {
  try {
    const userId = getUserIdFromAuth(req);
    const { id } = req.body;
    if (id) {
      await Notification.updateOne({ _id: id, recipient: userId }, { $set: { read: true } });
    } else {
      await Notification.updateMany({ recipient: userId, read: false }, { $set: { read: true } });
    }
    res.status(200).json({ message: "Marked read" });
  } catch (error) {
    console.error("Error marking notification read:", error);
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
}

module.exports = {
  sendNotification,
  getAccessToken,
  createNotification,
  listNotifications,
  unreadCount,
  markRead,
};
