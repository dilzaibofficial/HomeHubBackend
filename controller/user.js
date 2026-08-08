const User = require("../models/user");
const bcrypt = require("bcryptjs");
const { query, check, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { uploadOnCloudinary } = require("../Utility/cloudinary");
const VerificationToken = require("../models/verificationToken_model");
const sendTokenMail = require("../Utility/nodemailer.js");

const createAndSendToken = async (userId, reciever) => {
  const randomToken = Math.floor(Math.random() * (99999 - 10000 + 1)) + 10000;
  const randomTokenString = String(randomToken); // Converts the number to a string

  try {
    // Check if userId already exists in the VerificationToken table
    let existingToken = await VerificationToken.findOne({ owner: userId });
    console.log(existingToken);
    if (existingToken) {
      // Update the existing token

      try {
        // Update the token value and save it to the database
        existingToken.token = randomTokenString;
        await existingToken.save(); // Save changes

        // If saving is successful, proceed to send the email
        await sendTokenMail(
          "HomeHub Application Token Provider",
          randomTokenString,
          reciever
        );

        return { status: "success" }; // Both operations succeeded
      } catch (error) {
        // Catch any errors during saving or email sending
        return { status: "failed", msg: error.message };
      }
    } else {
      try {
        // Create a new verification token entry
        const newToken = await VerificationToken.create({
          owner: userId,
          token: randomTokenString,
        });

        // If the token creation succeeds, proceed to send the email
        await sendTokenMail(
          "HomeHub Application Token Provider",
          randomTokenString,
          reciever
        );

        return { status: "success" }; // Both operations succeeded
      } catch (error) {
        // Catch any errors during token creation or email sending
        return { status: "failed", msg: error.message };
      }
    }
  } catch (error) {
    console.error("Error handling verification token:", error.message);
    throw error; // Throw the error for further handling
  }
};

const handleRepeatTokenSend = async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.split(" ")[1];
  const verify = jwt.verify(token, process.env.JWT_SECRET);
  console.log(verify);
  try {
    const createTokenResult = await createAndSendToken(
      verify._id,
      verify.email
    );
    res
      .status(200)
      .json({ msg: "Token have been succesfully sended to your email" });
  } catch (error) {
    res.status(404).json({ msg: error });
  }
};

const VerifyToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.split(" ")[1];
  try {
    const verify = jwt.verify(token, process.env.JWT_SECRET);
    const id = verify._id;

    const tokenEntry = await VerificationToken.findOne({ owner: id });
    if (!tokenEntry) {
      return res
        .status(404)
        .json({ status: "Error", msg: "Token entry not found" });
    }

    const sendedToken = req.body.token;
    const validated = await bcrypt.compare(sendedToken, tokenEntry.token);
    if (validated) {
      // Update the user's verified field to true after successful validation
      const updatedUser = await User.findOneAndUpdate(
        { _id: id }, // Find the user by ID
        { Verified: true }, // Set the verified field to true
        { new: true } // Return the updated document
      );

      if (!updatedUser) {
        return res.status(404).json({ status: "Error", msg: "User not found" });
      }

      return res.status(200).json({
        status: "Matched Successfully",
        msg: "You have entered the right code",
        user: updatedUser,
      });
    } else {
      return res.status(400).json({
        status: "OTP Code Not Matched",
        msg: "You have entered the wrong OTP Code",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: "Error",
      msg: "An internal error occurred",
      error: error.message,
    });
  }
};

const changeForgetPassword = async (req, res) => {
  const password = req.body.password;
  const email = req.body.email;

  try {
    
    // Update the user's password
    const updatedUser = await User.findOneAndUpdate(
      { email: email }, // Find user by email
      { password: password }, // Update the password
      { new: true } // Return the updated document
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ status: "Error", msg: "User update failed" });
    }

    res.status(200).json({ msg: "Password have been succesfully changed" });
  } catch (error) {
    console.log(error);
  }
};

const forgetPasswordSend = async (req, res) => {
  console.log("hitting functions")
  try {
    const { email } = req.body; // Extract email from request body

    // Find user by email
    const user = await User.findOne({ email });

    // Check if user exists
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const createTokenResult = await createAndSendToken(user._id, user.email);
    res.status(200).json(createTokenResult);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const forgetPasswordChange = async (req, res) => {
  try {
    // Retrieve user by email (assuming email is provided in the request body)
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).json({ status: "Error", msg: "User not found" });
    }

    // Find the verification token associated with the user
    const tokenEntry = await VerificationToken.findOne({ owner: user._id });
    if (!tokenEntry) {
      return res
        .status(404)
        .json({ status: "Error", msg: "Token entry not found" });
    }

    const sendedToken = req.body.token;
    // Validate the token
    console.log(sendedToken);
    console.log(tokenEntry.token);
    const validated = await bcrypt.compare(sendedToken, tokenEntry.token);
    if (validated) {
      return res.status(200).json({
        status: "OTP MATCHED",
        msg: "OTP Have Successfull mathced",
      });
    } else {
      return res.status(400).json({
        status: "OTP Code Not Matched",
        msg: "You have entered the wrong OTP Code",
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "Error",
      msg: "An internal error occurred",
      error: error.message,
    });
  }
};

const signIn = async (req, res) => {
  console.log("asjkgji");
  
  try {
    // Step 1: Retrieve user from the database based on the email.
    const myData = await User.findOne(
      {
        email: req.body.email,
      },
      "_id username cnic password bankAccount BankAccountStripeId phonenumber Token" // Make sure "Token" is included in your schema
    ).exec();

    // Debug: Check if the user data is retrieved correctly.

    console.log(req.body.token);
    // Step 2: Check if the user exists and passwords match
    if (myData !== null) {
      if (myData.password === req.body.password) {
        // Step 3: Generate the JWT token
        const accessToken = jwt.sign(
          { response: myData },
          process.env.ACCESS_TOKEN_SECRET
        );



        console.log(req.body)
        // Step 4: Save the notification token (from req.body.token) to the user's record
        if (req.body.token) {
          console.log("token found");
          console.log("dkjsahghijds")
          myData.Token = req.body.token; // Save the notification token
          await myData.save(); // Save the updated user record
        }

        // Step 5: Respond with the access token to the client
        res.status(200).json({ accessToken });
      } else {
        // Incorrect password
        console.log("Password mismatch");
        res.status(404).json({ msg: "Your provided credentials don't match" });
      }
    } else {
      console.log("error 2");
      // No user found with that email
      res
        .status(404)
        .json({ msg: "No such user with the provided Email address" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Something went wrong" });
  }
};

const logout = async (req, res) => {
  console.log("abc");
  try {
    console.log(req.body.userId)
    // Step 1: Retrieve user from the database based on the user ID
    const myData = await User.findById(req.body.userId); // Assuming the user ID is passed in req.body.userId

    if (!myData) {
      console.log("User Not Found");
      // Step 2: If no user found, return error
      return res.status(404).json({ msg: "User not found" });
    }

    // Step 3: Remove the notification token from the user's record
    myData.Token = null; // Set Token field to null (or you can delete the field)

    // Step 4: Save the updated user record
    await myData.save();

    // Step 5: Respond with success
    res.status(200).json({ msg: "Logged out successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Something went wrong" });
  }
};

const signUp = async (req, res) => {
  console.log("this is data", req.body.email);
  console.log("this is file", req.files);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors.errors);
    return res.json({ errors: errors.errors });
  }

  let imageUrlArray = [];

  let uploadPromises = req.files.map((e) => {
    return uploadOnCloudinary(e.path) // Explicitly return the promise here
      .then((url) => {
        imageUrlArray.push(url);
      })
      .catch((error) => {
        console.error("Error uploading file:", error);
      });
  });

  let account;
  try {
    account = await stripe.accounts.create({
      type: "custom",
      country: "US",
      email: "testuser@example.com",
      capabilities: {
        transfers: { requested: true },
      },
      // Without this, Stripe leaves the "transfers" capability permanently
      // "inactive" (requirements.currently_due: ["business_profile.url"]) -
      // every payout/refund Transfer to this account fails until it's set.
      business_profile: {
        product_description: "Residential property rental management",
        mcc: "6513",
      },
      business_type: "individual",
      individual: {
        first_name: "John",
        last_name: "Doe",
        dob: { day: 1, month: 1, year: 1990 },
        address: {
          line1: "123 Main St",
          city: "San Francisco",
          state: "CA",
          postal_code: "94111",
        },
        ssn_last_4: "0000", // Test SSN
      },
      external_account: {
        object: "bank_account",
        country: "US",
        currency: "usd",
        routing_number: "110000000", // Test routing number
        account_number: "000123456789", // Test account number
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000), // Accept terms of service at the current time
        ip: req.ip, // Provide the IP address of the user accepting the terms
      },
    });
  } catch (error) {
    console.error("Error creating Stripe account:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to set up payment account",
    });
  }

  Promise.all(uploadPromises)
    .then(async () => {
      try {
        const username = req.body.username;
        const email = req.body.email;
        const password = req.body.password;
        const cnic = req.body.cnic;
        const phonenumber = req.body.phonenumber;
        const bankAccounted = req.body.bankAccount;
        const assest = imageUrlArray; // Use the updated array of image URLs

        const myData = new User({
          username: username,
          email: email,
          password: password,
          cnic: cnic,
          phonenumber: phonenumber,
          bankAccount: bankAccounted,
          BankAountStripeId: account.id,
          CNICImageArray: assest,
          Token: req.body.token || null,
        });

        // Save the new issue to the database
        const savedUser = await myData.save();
        console.log(savedUser);
        // Create a Stream Chat client

        const accessToken = jwt.sign(
          { response: savedUser },
          process.env.ACCESS_TOKEN_SECRET
        );
        res.status(202).json({
          success: true,
          token: accessToken,
        });
      } catch (error) {
        console.error("Error creating User:", error);
        res.status(500).json({
          success: false,
          error: "Internal Server Error",
        });
      }
    })
    .catch((error) => {
      console.error("Error uploading files:", error);
      res.status(500).json({
        success: false,
        error: "Error uploading files",
      });
    });
};

const updateNotificationToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }
  try {
    const verify = jwt.verify(authHeader.split(" ")[1], process.env.ACCESS_TOKEN_SECRET);
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }
    await User.findByIdAndUpdate(verify.response._id, { Token: token });
    res.status(200).json({ message: "Token updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const editProfile = async (req, res) => {
  try {
    const { id, bankAccount, phonenumber } = req.body;
    // Validate input
    if (!bankAccount || !phonenumber) {
      return res
        .status(400)
        .json({ message: "Account and phone number are required" });
    }

    const update = { bankAccount, phonenumber };

    if (req.file) {
      const imageUrl = await uploadOnCloudinary(req.file.path);
      if (!imageUrl) {
        return res.status(500).json({ message: "Failed to upload profile image" });
      }
      update.profileImage = imageUrl;
    }

    // Find the user by ID and update
    const user = await User.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true } // Return updated user
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const viewProfile = async (req, res) => {
  try {
    const { id } = req.body; // Get user ID from request parameters
    
    // Find the user by ID
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.status(200).json({ message: "User profile fetched successfully", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};


module.exports = {
  signIn,
  signUp,
  editProfile,
  logout,
  viewProfile,
  handleRepeatTokenSend,
  forgetPasswordChange,
  VerifyToken,
  changeForgetPassword,
  forgetPasswordSend,
  updateNotificationToken,

};
