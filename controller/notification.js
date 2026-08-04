const admin = require("firebase-admin");
const { google } = require("googleapis");
const path = require("path");
const User = require("../models/user");

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

module.exports = {
  sendNotification,
  getAccessToken,
  createNotification,
};
