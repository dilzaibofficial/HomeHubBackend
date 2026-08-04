const { default: mongoose } = require("mongoose");
const Credit = require("../models/Credit");
const jwt = require("jsonwebtoken");

const CreatePayment = async (req, res) => {
  // Move the code to extract title and create property inside the Promise.all().then() block
  const authHeader = req.headers.authorization;
  const token = authHeader.split(" ")[1];
  try {
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const _id = verify.response._id;
    const TransactionType = req.body.TransactionType;
    const PaymentIntentId = req.body.PaymentIntentId;
    const TransactionAmount = req.body.TransactionAmount;
    const InAccordance = req.body.InAccordance;
    const InAccordancePropertyId = req.body.InAccordancePropertyId;
    const SendedId = req.body.SendedId;
    const RecieverId = req.body.RecieverId;

    // A retried/duplicate request (double-tap, network retry after the
    // first response was lost) for the exact same payment must not create
    // a second ledger row.
    const existing = await Credit.findOne({
      PaymentIntentId: PaymentIntentId,
      TransactionType: TransactionType,
    });
    if (existing) {
      return res.status(201).json({
        success: true,
        Credit: existing,
      });
    }

    const myData = new Credit({
      PaymentIntentId: PaymentIntentId,
      TransactionType: TransactionType, // "Escrow" as the transaction type
      TransactionAmount: TransactionAmount,
      InAccordance: InAccordance,
      SendedId: SendedId,
      RecieverId: RecieverId,
      InAccordancePropertyId: InAccordancePropertyId,
    });

    // Save the new property to the database
    const savedCredit = await myData.save();

    res.status(201).json({
      success: true,
      Credit: savedCredit,
    });
  } catch (error) {
    console.error("Error creating Credit:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

const UpdateEscrow = async (req, res) => {
  try {
    const {
      RecieverId,
      SendedId,
      InAccordancePropertyId,
      TransactionTypeConvert,
    } = req.body;

    console.log(req.body);
    // Find and update the escrow transaction in the database
    const updatedCredit = await Credit.findOneAndUpdate(
      {
        SendedId: SendedId,
        RecieverId: RecieverId,
        InAccordancePropertyId: InAccordancePropertyId,
        TransactionType: "Escrow",
      },
      {
        $set: {
          TransactionType: TransactionTypeConvert,
          SendedId: RecieverId,
          RecieverId: SendedId,
        },
      },
      { new: true } // Return the updated document
    );

    if (!updatedCredit) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found or does not match the criteria.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Escrow transaction updated successfully.",
      updatedCredit: updatedCredit,
    });
  } catch (error) {
    console.error("Error updating escrow transaction:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

const getTransactionsById = async (req, res) => {
  const { userId } = req.body; // Assuming the userId is passed in the request body

  try {
    // Find all documents where the provided userId is either the sender or the receiver
    const transactions = await Credit.find({
      $or: [{ SendedId: userId }, { RecieverId: userId }],
    });

    if (transactions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No transactions found for the provided user ID.",
      });
    }

    res.status(200).json({
      success: true,
      transactions: transactions,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

module.exports = {
  CreatePayment,
  UpdateEscrow,
  getTransactionsById,
};
