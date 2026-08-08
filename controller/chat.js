// Public chatbot endpoint - no auth required, so visitors can ask about
// HomeHub before they've signed up or logged in.

const SYSTEM_PROMPT = `You are "Home Hub Assistant", the friendly help bot for the HomeHub mobile app.

What HomeHub does:
- HomeHub is a rental marketplace. Landlords ("owners") list properties for rent - flats, hostels, rooms for bachelors or families.
- Tenants browse listings, and can start a rental agreement on a property.
- To start an agreement, the tenant pays a one-time advance into escrow (held safely by HomeHub, not sent to the owner yet).
- Both the tenant and the owner then negotiate/confirm details in the app. Once BOTH sides accept ("handshake"), the escrowed advance is released to the owner and the deal is finalized.
- If either side rejects the agreement before that handshake, the escrowed advance is refunded back to the tenant automatically - no money is lost.
- After a deal is finalized, rent for the next month can be paid again through the app.
- Users sign up with email, username, password, CNIC (13-digit Pakistani ID), phone number (with country code), and a card/bank account number for payouts and refunds.
- The app sends push notifications for agreement updates (accepted, rejected, finalized).

Your job: answer questions about how HomeHub works, how renting/escrow/agreements work, and guide users toward signing up or logging in. Be concise, warm, and helpful - a few sentences per answer, not essays. If asked something outside HomeHub's scope, politely say you can only help with HomeHub-related questions. Never invent specific property listings, prices, or user data you don't have.`;

const askChatbot = async (req, res) => {
  try {
    const {message, history} = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "A message is required." });
    }
    if (message.length > 1000) {
      return res.status(400).json({ error: "Message is too long." });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }))
      : [];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...safeHistory,
          { role: "user", content: message.trim() },
        ],
        temperature: 0.6,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("OpenAI error:", response.status, errBody);
      return res.status(502).json({ error: "The assistant is temporarily unavailable. Please try again." });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: "The assistant is temporarily unavailable. Please try again." });
    }

    res.status(200).json({ reply });
  } catch (error) {
    console.error("Error in askChatbot:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};

module.exports = { askChatbot };
