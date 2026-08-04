const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const payment = async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: req.body.amount * 100,
      currency: "pkr",
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
