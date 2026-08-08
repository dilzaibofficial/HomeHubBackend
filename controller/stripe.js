const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Pakistan isn't a supported Stripe Connect country, so every owner/tenant
// payout account created at signup is actually a workaround US-based
// connected account (see user.js signUp) settled in USD. If this escrow
// PaymentIntent collected in PKR, the platform's Stripe balance would only
// ever hold PKR, and every later payout/refund Transfer (which pulls from
// the platform's USD balance) would fail with "insufficient balance" -
// surfacing to users as a finalize/reject 502. Collecting in USD here,
// using the same PKR->USD rate the transfer amounts are already computed
// with, keeps the whole money trail in one currency end to end.
const PKR_TO_USD = 0.0036;

const payment = async (req, res) => {
  try {
    const usdCents = Math.round(req.body.amount * PKR_TO_USD * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: usdCents,
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
    });
    res.json({ paymentIntent: paymentIntent.client_secret });
  } catch (e) {
    console.log(e);
    res.status(400).json({
      error: e.message,
    });
  }
};

const getPaymentInfo = async (req, res) => {
  try {
    let { id } = req.body;

    // If the id contains the client secret, extract the PaymentIntent id
    if (id.includes('_secret_')) {
      id = id.split('_secret_')[0];
    }

    let result;

    if (id.startsWith("pi_")) {
      // Retrieve PaymentIntent
      result = await stripe.paymentIntents.retrieve(id);
    } else if (id.startsWith("tr_")) {
      // Retrieve Transfer
      result = await stripe.transfers.retrieve(id);
    } else {
      return res.status(400).json({
        error: "Invalid ID prefix. Must start with 'pi_' for PaymentIntents or 'tr_' for Transfers.",
      });
    }

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(400).json({
      error: e.message,
    });
  }
};


module.exports = {
  payment,
  getPaymentInfo,
};
