const mongoose = require("mongoose");

// Local dev falls back to a local MongoDB; Render (and anywhere else in
// production) must set MONGO_URL in its environment variables to the
// Atlas connection string.
const url = process.env.MONGO_URL || "mongodb://localhost:27017/homeHub";

const connectDB = () => {
    console.log(`Connecting to ${process.env.MONGO_URL ? "Atlas" : "Local"} Database...`);
    return mongoose.connect(url, {
        useNewUrlParser : true,
        useUnifiedTopology : true,
    });
}

module.exports = connectDB;