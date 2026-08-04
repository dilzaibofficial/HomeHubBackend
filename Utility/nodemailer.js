const SibApiV3Sdk = require("sib-api-v3-sdk");

// Initialize Brevo API
const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

/**
 * Send General Email
 * @param {string} sub - Subject of email
 * @param {string} msg - HTML message
 */
const sendMail = async (sub, msg) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: { email: "your-email@gmail.com", name: "Your Name" },
      to: [{ email: "bondfire.life@gmail.com", name: "Bondfire" }],
      subject: sub,
      htmlContent: msg,
    });

    console.log("✅ Email Sent via Brevo");
  } catch (error) {
    console.error("❌ Sending mail error:", error.response?.data || error.message);
  }
};

/**
 * Send Token Email to a Specific Receiver
 * @param {string} sub - Subject of email
 * @param {string} msg - HTML message
 * @param {string} receiver - Recipient email
 */
const sendTokenMail = async (sub, msg, receiver) => {
  try {
    await apiInstance.sendTransacEmail({
      sender: { email: "hurairashahid0@gmail.com", name: "HomeHub Admin" },
      to: [{ email: receiver, name: "Receiver" }],
      subject: sub,
      htmlContent: msg,
    });

    console.log("✅ Token Email Sent via Brevo");
  } catch (error) {
    console.error("❌ Sending mail error:", error.response?.data || error.message);
  }
};

module.exports = sendTokenMail;
