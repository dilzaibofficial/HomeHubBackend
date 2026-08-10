const { default: mongoose } = require("mongoose");
const { uploadOnCloudinary } = require("../Utility/cloudinary");
const { buildAgreementPdf } = require("../Utility/generateAgreementPdf");
const Property = require("../models/property");
const jwt = require("jsonwebtoken");
const Agreement = require("../models/Agreement");
const User = require("../models/user");
const Notification = require("../models/Notification");
const { sendNotification } = require("./notification");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Fire-and-forget notification - a failure here must never break the
// caller's main flow (agreement/payment already succeeded by the time this
// runs). Persists an in-app Notification (drives the notifications screen
// and badge counts) and sends a push if the user has a device token -
// independently, so one failing never blocks the other.
const notifyUser = async (userId, title, body, meta = {}) => {
  if (!userId) return;
  try {
    await Notification.create({
      recipient: userId,
      title,
      body,
      type: meta.type || "payment",
      property: meta.propertyId || null,
      agreement: meta.agreementId || null,
      scrollTo: meta.scrollTo || null,
      forOwner: !!meta.forOwner,
    });
  } catch (error) {
    console.error("Error creating in-app notification:", error);
  }
  try {
    const user = await User.findById(userId);
    if (user && user.Token) {
      await sendNotification(user.Token, title, body);
    }
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

const createProperty = async (req, res) => {
  console.log(req.body);
  console.log("this is first log in controller ", req.files);
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

  Promise.all(uploadPromises)
    .then(async () => {
      console.log(req.body);
      // Move the code to extract title and create property inside the Promise.all().then() block
      try {
        const title = req.body.title;
        const description = req.body.description;
        const type = req.body.type;
        const rent = req.body.rent;
        const advance = req.body.advance;
        const bachelor = req.body.bachelor;
        const state = "Malir";
        const city = "karachi";
        const area = "Defence";
        const address = req.body.address;
        const coordinate = req.body.coordinate;
        const assest = imageUrlArray; // Use the updated array of image URLs
        const bedroom = req.body.bedroom;
        const bathroom = req.body.bathroom;
        const areaofhouse = req.body.areaofhouse;
        const peoplesharing = req.body.peoplesharing;
        const propertyowner = req.body.propertyOwner;

        const myData = new Property({
          title: title,
          description: description,
          type: type,
          rent: rent,
          advance: advance,
          bachelor: bachelor,
          state: state,
          city: city,
          area: area,
          address: address,
          coordinate: coordinate,
          assest: assest,
          bedroom: bedroom,
          bathroom: bathroom,
          areaofhouse: areaofhouse,
          peoplesharing: peoplesharing,
          propertyowner: propertyowner,
        });

        // Save the new property to the database
        const savedProperty = await myData.save();

        res.status(201).json({
          success: true,
          property: savedProperty,
        });
      } catch (error) {
        console.error("Error creating Property:", error);
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

const myProperty = async (req, res) => {
  try {
    // Validate input
    if (!req.body.propertyowner) {
      return res.status(400).json({ error: "Property owner is required" });
    }
    console.log(req.body.propertyowner);
    // Fetch data from the database
    const myData = await Property.find(
      { propertyowner: req.body.propertyowner },
      "_id title description type rent advance bachelor state city area address assest bedroom bathroom areaofhouse propertyowner propertySelling peoplesharing coordinate rented"
    )
    .populate("propertyowner")
    .sort({ _id: -1 })
    .exec();

    // Check if any data was found
    if (myData.length === 0) {
      return res.status(200).json(myData);
    }

    // Send response
    res.status(200).json(myData);
  } catch (error) {
    // Log the error and send a server error response
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const MyAgreement = async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.split(" ")[1];
  console.log(token);
  const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  const _id = verify.response._id;
  try {
    // Validate input
    console.log(_id);
    // Fetch data from the database
    const myData = await Property.find(
      { "propertySelling.agreementMaker": _id }, // Corrected the property path
      "_id title description type rent advance bachelor state city area address assest bedroom bathroom areaofhouse propertyowner propertySelling peoplesharing coordinate rented"
    )
    .populate("propertyowner")
    .sort({ _id: -1 })
    .exec();

    // Check if any data was found
    if (myData.length === 0) {
      return res.status(200).json(myData);
    }

    // Send response
    res.status(200).json(myData);
  } catch (error) {
    // Log the error and send a server error response
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Owners can edit/delete their own listings, but never once a tenant has
// an active or completed agreement on it - the tenant's expectations (and
// the underlying escrow/rent numbers baked into that Agreement) are
// already locked in at that point.
const guardEditableProperty = async (req, res, requesterId) => {
  const property = await Property.findById(req.body.propertyId);
  if (!property) {
    res.status(404).json({ message: "Property not found" });
    return null;
  }
  if (property.propertyowner.toString() !== requesterId) {
    res.status(403).json({ message: "You can only manage your own property" });
    return null;
  }
  if (property.propertySelling.agreement || property.rented) {
    res.status(409).json({
      message: "This property has an active or completed agreement and can't be edited or deleted.",
    });
    return null;
  }
  return property;
};

const deleteProperty = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }
  try {
    const verify = jwt.verify(authHeader.split(" ")[1], process.env.ACCESS_TOKEN_SECRET);
    const property = await guardEditableProperty(req, res, verify.response._id);
    if (!property) return;

    await Property.findByIdAndDelete(req.body.propertyId);
    res.status(200).json({ message: "Property deleted successfully" });
  } catch (error) {
    console.error("Error deleting property:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const editProperty = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }
  try {
    const verify = jwt.verify(authHeader.split(" ")[1], process.env.ACCESS_TOKEN_SECRET);
    const property = await guardEditableProperty(req, res, verify.response._id);
    if (!property) return;

    const editableFields = [
      "title", "description", "rent", "advance", "bedroom",
      "bathroom", "areaofhouse", "peoplesharing", "address", "bachelor",
    ];
    const update = {};
    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      req.body.propertyId,
      { $set: update },
      { new: true, runValidators: true }
    );

    res.status(200).json({ message: "Property updated successfully", property: updatedProperty });
  } catch (error) {
    console.error("Error editing property:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const freshRecommendation = async (req, res) => {
  try {
    // Validate input
    if (!req.body.propertyowner) {
      return res.status(400).json({ error: "Property owner is required" });
    }

    // Fetch data from the database
    const myData = await Property.find(
      {
        $and: [
          { propertyowner: { $ne: req.body.propertyowner } }, // Property owner not equal
          { "propertySelling.agreement": { $ne: true } }, // Agreement maker not equal
        ],
      }, // Use $ne for not equal
      "_id title description type rent advance bachelor state city area address assest bedroom bathroom areaofhouse propertyowner propertySelling peoplesharing coordinate rented"
    )
      .populate("propertyowner") // This will replace the ObjectId with the full User document
      .exec();

    // Check if any data was found
    if (myData.length === 0) {
      return res.status(404).json(myData);
    }

    // Send response
    res.status(200).json(myData);
  } catch (error) {
    // Log the error and send a server error response
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// AI-powered natural-language property matcher. The user describes what
// they want in plain text ("2 rooms, beautiful house, 1 washroom, Clifton
// Karachi") and this ranks real listings from the DB against it - it never
// invents properties, it only selects/ranks from what's actually available.
const aiRecommendProperties = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const _id = verify.response._id;

    const prompt = (req.body.prompt || "").trim();
    if (!prompt) {
      return res.status(400).json({ error: "Please describe what you're looking for." });
    }
    if (prompt.length > 500) {
      return res.status(400).json({ error: "That description is too long." });
    }

    // Only recommend properties the user could actually rent: not their own,
    // not already under an active agreement, not already rented out.
    const candidates = await Property.find({
      propertyowner: { $ne: _id },
      "propertySelling.agreement": { $ne: true },
      rented: { $ne: true },
    })
      .populate("propertyowner")
      .limit(80)
      .exec();

    if (candidates.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const candidateSummaries = candidates.map((p) => ({
      id: p._id.toString(),
      title: p.title,
      type: p.type,
      bedroom: p.bedroom,
      bathroom: p.bathroom,
      rent: p.rent,
      advance: p.advance,
      areaofhouse: p.areaofhouse,
      peoplesharing: p.peoplesharing,
      bachelor: p.bachelor,
      address: p.address,
      description: (p.description || "").slice(0, 180),
    }));

    const systemPrompt = `You are the property-matching engine for HomeHub, a rental app. You are given a user's natural-language request and a JSON list of available properties. Pick and rank the properties that genuinely best satisfy the request.

Rules:
- Bedroom/bathroom counts matter most - only include properties that reasonably match the requested room counts (exact match preferred; allow +/-1 only if nothing exact exists).
- Location is written freely in each property's "address" field. Match it loosely: if the user names a specific neighborhood/area (e.g. "Clifton") and no property's address contains it, fall back to matching the wider city named in the request (e.g. "Karachi") instead of returning nothing. If the request has no usable location or no property address matches even the city, ignore location and rank on the other criteria.
- Use "description" and "title" text to judge softer qualities the user asks for (e.g. "beautiful", "spacious", "modern") - only credit a property for this if its own text actually supports it, never invent details.
- Never invent or include a property id that is not in the given list.
- Return the BEST matches first. Return at most 10 results. If truly nothing reasonably matches, return an empty results array rather than forcing bad matches.

Respond ONLY with JSON in this exact shape: {"results":[{"id":"<property id>","reason":"<one short sentence>"}]} ordered best match first.`;

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `User's request: "${prompt}"\n\nAvailable properties:\n${JSON.stringify(candidateSummaries)}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      console.error("OpenAI error (aiRecommend):", aiResponse.status, errBody);
      return res.status(502).json({ error: "The AI matcher is temporarily unavailable. Please try again." });
    }

    const aiData = await aiResponse.json();
    let parsed;
    try {
      parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
    } catch (parseErr) {
      console.error("Failed to parse AI recommendation JSON:", aiData.choices?.[0]?.message?.content);
      return res.status(502).json({ error: "The AI matcher returned an unexpected response. Please try again." });
    }

    const rankedIds = Array.isArray(parsed.results) ? parsed.results : [];
    const candidateById = new Map(candidates.map((p) => [p._id.toString(), p]));

    const results = rankedIds
      .filter((r) => r && candidateById.has(r.id))
      .slice(0, 10)
      .map((r, index) => {
        const property = candidateById.get(r.id).toObject();
        return { ...property, aiRank: index + 1, aiReason: r.reason || null };
      });

    res.status(200).json({ results });
  } catch (error) {
    console.error("Error in aiRecommendProperties:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};

const buyerDetail = async (req, res) => {
  try {
    // Validate input
    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1];
    console.log(token);
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const _id = verify.response._id;

    // Fetch data from the database
    const myData = await Property.find(
      {
        $and: [
          { propertyowner: _id }, // Property owner not equal
          { "propertySelling.agreement": true }, // Agreement maker not equal
        ],
      }, // Use $ne for not equal
      "_id title description type rent advance bachelor state city area address assest bedroom bathroom areaofhouse propertyowner propertySelling peoplesharing coordinate rented"
    )
      .populate("propertySelling.agreementMaker")
      .sort({ _id: -1 })
      .exec();

    // Check if any data was found
    if (myData.length === 0) {
      return res.status(200).json(myData);
    }

    // Send response
    res.status(200).json(myData);
  } catch (error) {
    // Log the error and send a server error response
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const makeAgreement = async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader.split(" ")[1];

  try {
    // Verify the JWT token and get the user ID
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const _id = verify.response._id;

    // Step 1: Find the Property first to check if it exists
    const property = await Property.findById(req.body.propertyId);

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    if (property.rented) {
      return res.status(409).json({ error: "Property is already rented" });
    }

    // If this exact user already has an active agreement on this property
    // (e.g. a retried/duplicate request), return the existing one instead
    // of creating a second one.
    if (property.propertySelling.agreement) {
      if (
        property.propertySelling.agreementMaker &&
        property.propertySelling.agreementMaker.toString() === _id
      ) {
        const existingAgreementId =
          property.propertySelling.agreementIds[
            property.propertySelling.agreementIds.length - 1
          ];
        const existingAgreement = await Agreement.findById(existingAgreementId);
        return res
          .status(200)
          .json({ updatedProperty: property, agreement: existingAgreement });
      }
      return res
        .status(409)
        .json({ error: "Property already has an active agreement" });
    }

    // Step 2: Atomically claim the property for this agreement first, so two
    // concurrent requests can't both pass the check above and both proceed.
    const claimedProperty = await Property.findOneAndUpdate(
      {
        _id: req.body.propertyId,
        "propertySelling.agreement": { $ne: true },
        rented: { $ne: true },
      },
      { $set: { "propertySelling.agreement": true } },
      { new: true }
    );

    if (!claimedProperty) {
      return res
        .status(409)
        .json({ error: "Property already has an active agreement" });
    }

    // Step 3: Create the Agreement
    const newAgreement = new Agreement({
      PropertyId: req.body.propertyId,
      buyerId: _id,
      agreementPricePaid: req.body.agreementPricePaid,
    });

    const savedAgreement = await newAgreement.save();

    // Step 4: Link the Agreement to the Property
    const updatedProperty = await Property.findByIdAndUpdate(
      req.body.propertyId,
      {
        $set: {
          "propertySelling.agreementMaker": new mongoose.Types.ObjectId(_id),
        },
        $push: {
          "propertySelling.agreementIds": savedAgreement._id,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedProperty) {
      return res
        .status(502)
        .json({ error: "Operation not performed, property not updated" });
    }

    notifyUser(
      updatedProperty.propertyowner,
      "New Agreement Request",
      `Someone wants to rent "${updatedProperty.title}". Advance of Rs ${req.body.agreementPricePaid} is now in escrow.`,
      {
        type: "agreement_request",
        propertyId: updatedProperty._id,
        agreementId: savedAgreement._id,
        scrollTo: "negotiation",
        forOwner: true,
      }
    );

    // Step 5: Return the updated property and agreement details
    res.status(200).json({ updatedProperty, agreement: savedAgreement });
  } catch (error) {
    console.error("Error making agreement:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const agreementDetailShow = async (req, res) => {
  const propertyId = req.body.propertyId;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify token
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const _id = verify.response._id;

    // Find property by ID
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Extract ownerId and agreementMakerId
    const propertyOwner = property.propertyowner;
    const propertyBuyerId = property.propertySelling.agreementMaker;
    const AgreementDetail =
      property.propertySelling.agreementIds[
        property.propertySelling.agreementIds.length - 1
      ];
    console.log(propertyOwner);
    console.log(AgreementDetail.toString());
    console.log(propertyBuyerId.toString());

    // Fetch owner and agreement maker details
    const owner = await User.findById(propertyOwner);
    const agreementMakerID = await User.findById(propertyBuyerId.toString());
    const agreementDetails = await Agreement.findById(
      AgreementDetail.toString()
    );

    if (!owner || !agreementMakerID) {
      return res
        .status(404)
        .json({ message: "Owner or Agreement Maker not found" });
    }

    // Respond with details
    res.status(200).json({
      property,
      owner,
      agreementMakerID,
      agreementDetails,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const AccceptAgreement = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];
  const agreementId = req.body.Id;

  try {
    // Verify token
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const _id = verify.response._id;

    // Find agreement by ID
    const agreement = await Agreement.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found" });
    }

    // Check if _id matches buyerId
    if (_id == agreement.buyerId.toString()) {
      agreement.agreementBuyer = true;
    } else {
      agreement.agreementOwner = true;
    }

    // Save updated agreement
    await agreement.save();

    const property = await Property.findById(agreement.PropertyId);
    if (property) {
      const otherPartyId =
        _id == agreement.buyerId.toString()
          ? property.propertyowner
          : property.propertySelling.agreementMaker;
      notifyUser(
        otherPartyId,
        "Agreement Update",
        `${property.title}: the other party accepted the agreement. Accept your side to finalize the deal.`,
        {
          type: "handshake",
          propertyId: property._id,
          agreementId: agreement._id,
          scrollTo: "negotiation",
          forOwner: otherPartyId.toString() === property.propertyowner.toString(),
        }
      );
    }

    res.status(200).json({ message: "Agreement updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const RejectAgreement = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];
  const agreementId = req.body.Id;
  const propertId = req.body.propertyId;
  const amount = req.body.amount;
  const recipientId = req.body.recipientId;
  try {
    // Verify token
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const _id = verify.response._id;

    // Find agreement by ID
    const agreement = await Agreement.findById(agreementId);
    const property = await Property.findById(propertId);

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found" });
    }
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Only the buyer or the property owner may reject this agreement.
    const isBuyer = _id === agreement.buyerId.toString();
    const isOwner = _id === property.propertyowner.toString();
    if (!isBuyer && !isOwner) {
      return res.status(403).json({ message: "Not authorized to reject this agreement" });
    }

    if (!recipientId || !recipientId.startsWith("acct_")) {
      return res.status(400).json({
        message:
          "The buyer's payout account isn't set up correctly, so the escrow can't be refunded automatically. Please contact support.",
      });
    }

    // Atomically claim the "reject" action so a double-tap/retry can only
    // trigger the refund transfer once.
    const claimedAgreement = await Agreement.findOneAndUpdate(
      { _id: agreementId, agreementSuccess: { $ne: false } },
      { $set: { agreementSuccess: false } },
      { new: true }
    );
    if (!claimedAgreement) {
      return res
        .status(409)
        .json({ message: "This agreement has already been rejected/processed" });
    }

    // Create the refund Transfer BEFORE changing the property's state, so a
    // failed transfer (e.g. bad destination account) doesn't leave the
    // property showing as un-rented while no money actually moved.
    let transfer;
    try {
      transfer = await stripe.transfers.create(
        {
          amount: amount, // amount in cents
          currency: "usd",
          destination: recipientId, // Connected Account ID (acct_...)
        },
        { idempotencyKey: `reject-${agreementId}` }
      );
    } catch (stripeError) {
      console.error("Stripe transfer failed on reject:", stripeError);
      // Un-claim so this can be retried once the underlying issue is fixed.
      await Agreement.findByIdAndUpdate(agreementId, { agreementSuccess: null });
      return res.status(502).json({
        message: `Refund failed: ${stripeError.message}`,
      });
    }

    property.propertySelling.agreement = false;
    property.propertySelling.agreementMaker = null;
    await property.save();

    notifyUser(
      agreement.buyerId,
      "Agreement Rejected",
      `${property.title}: the agreement was rejected and your escrow of Rs ${(amount / 0.36).toFixed(0)} is being refunded.`,
      {
        type: "rejected",
        propertyId: property._id,
        agreementId: agreement._id,
        forOwner: false,
      }
    );

    res
      .status(200)
      .json({ message: "Agreement Rejected successfully", transfer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

const MakeNegotationPrice = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];
  const agreementId = req.body.agreementId;
  const negotationPrice = req.body.negotationPrice;
  try {
    // Verify token
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Find agreement by ID
    const agreement = await Agreement.findById(agreementId);

    if (!agreement) {
      return res.status(404).json({ message: "Agreement not found" });
    }

    agreement.negotationPrice = negotationPrice;

    // Save updated agreement
    await agreement.save();

    const property = await Property.findById(agreement.PropertyId);
    if (property) {
      // Notify both sides, not just the tenant - whichever of them made this
      // offer already knows; it's the OTHER party who needs the alert, and
      // since either side can be the one proposing a price, the simplest
      // correct fix is to always tell both.
      notifyUser(
        property.propertySelling.agreementMaker,
        "Negotiation Price Updated",
        `${property.title}: the monthly rent was negotiated to Rs ${negotationPrice}.`,
        {
          type: "negotiation",
          propertyId: property._id,
          agreementId: agreement._id,
          scrollTo: "negotiation",
          forOwner: false,
        }
      );
      notifyUser(
        property.propertyowner,
        "Negotiation Price Updated",
        `${property.title}: the monthly rent was negotiated to Rs ${negotationPrice}.`,
        {
          type: "negotiation",
          propertyId: property._id,
          agreementId: agreement._id,
          scrollTo: "negotiation",
          forOwner: true,
        }
      );
    }

    res.status(200).json({ message: "Negotation Price Updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const pricePaid = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }
  try {
    jwt.verify(authHeader.split(" ")[1], process.env.ACCESS_TOKEN_SECRET);

    const { amount, currency, recipientType, recipientId } = req.body;

    if (!amount || !currency || !recipientType || !recipientId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate recipient type
    if (recipientType !== "card" && recipientType !== "bank_account") {
      return res.status(400).json({ error: "Invalid recipient type" });
    }

    // Create a Transfer to the connected account
    const transfer = await stripe.transfers.create({
      amount: amount, // amount in cents
      currency: currency,
      destination: recipientId, // Connected Account ID (acct_...)
    });

    res.status(200).json({ success: true, transfer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

const DealDone = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];
  const propertId = req.body.propertyId;
  const recipientId = req.body.recipientID;
  const amount = req.body.amount;
  const agreementID = req.body.agreementID;

  try {
    // Verify token
    const verify = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (!recipientId || !recipientId.startsWith("acct_")) {
      return res.status(400).json({
        message:
          "The owner's payout account isn't set up correctly, so this payment can't be transferred. Please contact support.",
      });
    }

    // Atomically claim this transfer: only allow it if no transfer for this
    // agreement was initiated in the last 60 seconds. This is what actually
    // stops a double-tap or a network retry from firing two real Stripe
    // transfers for the same finalize/repay action - it does NOT block a
    // legitimate transfer next month, since that happens weeks later.
    const lockWindowAgo = new Date(Date.now() - 60 * 1000);
    const claimedAgreement = await Agreement.findOneAndUpdate(
      {
        _id: agreementID,
        $or: [
          { priceTransferDate: null },
          { priceTransferDate: { $lt: lockWindowAgo } },
        ],
      },
      { $set: { priceTransferDate: new Date() } },
      { new: true }
    );

    if (!claimedAgreement) {
      return res.status(409).json({
        message: "A payment for this agreement is already being processed",
      });
    }

    // Find the property
    const property = await Property.findById(propertId);
    if (!property) {
      await Agreement.findByIdAndUpdate(agreementID, { priceTransferDate: null });
      return res.status(404).json({ message: "Property not found" });
    }

    // Create the Transfer BEFORE changing the property's state, so a failed
    // transfer (e.g. bad destination account) doesn't leave the property
    // marked rented while no money actually moved. The idempotency key
    // includes the lock timestamp we just claimed above, so this specific
    // claimed attempt can safely be retried without ever double-transferring.
    let transfer;
    try {
      transfer = await stripe.transfers.create(
        {
          amount: amount, // amount in cents
          currency: "usd",
          destination: recipientId, // Connected Account ID (acct_...)
        },
        {
          idempotencyKey: `dealdone-${agreementID}-${claimedAgreement.priceTransferDate.getTime()}`,
        }
      );
    } catch (stripeError) {
      console.error("Stripe transfer failed on dealDone:", stripeError);
      // Un-claim so this can be retried once the underlying issue is fixed.
      await Agreement.findByIdAndUpdate(agreementID, { priceTransferDate: null });
      return res.status(502).json({
        message: `Payment failed: ${stripeError.message}`,
      });
    }

    // Capture this BEFORE flipping rented to true - it's the only way to
    // tell "first-time finalize" apart from a later monthly repay, since
    // both go through this same endpoint and both leave rented === true.
    const isFirstFinalize = !property.rented;

    // Set the property as rented and set the deal done date
    property.rented = true;
    const today = new Date();
    property.propertySelling.dealDoneDate = today;
    // 30 days from now this property automatically becomes available again
    // unless it's re-claimed by a subsequent DealDone (repayment) call.
    property.propertySelling.resetDueAt = new Date(
      today.getTime() + 30 * 24 * 60 * 60 * 1000
    );
    await property.save();

    claimedAgreement.agreementSuccess = true;
    await claimedAgreement.save();

    notifyUser(
      claimedAgreement.buyerId,
      "Deal Finalized",
      `${property.title}: your payment of Rs ${(amount / 0.36).toFixed(0)} was transferred successfully to the owner.`,
      {
        type: "payment",
        propertyId: property._id,
        agreementId: agreementID,
        forOwner: false,
      }
    );
    notifyUser(
      property.propertyowner,
      "Payment Received",
      `${property.title}: you received a payment of Rs ${(amount / 0.36).toFixed(0)} from the tenant.`,
      {
        type: "payment",
        propertyId: property._id,
        agreementId: agreementID,
        forOwner: true,
      }
    );

    // The agreement PDF is only generated/relevant once, at the first
    // finalize - not on every later monthly repay through this same endpoint.
    if (isFirstFinalize) {
      notifyUser(
        claimedAgreement.buyerId,
        "Rental Agreement Ready",
        `${property.title}: your official HomeHub rental agreement PDF is ready to view.`,
        {
          type: "agreement_pdf",
          propertyId: property._id,
          agreementId: agreementID,
          forOwner: false,
        }
      );
      notifyUser(
        property.propertyowner,
        "Rental Agreement Ready",
        `${property.title}: the official HomeHub rental agreement PDF is ready to view.`,
        {
          type: "agreement_pdf",
          propertyId: property._id,
          agreementId: agreementID,
          forOwner: true,
        }
      );
    }

    // Respond with success
    res.status(200).json({ message: "Deal done successfully", transfer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
};

// Streams the finalized agreement as a branded PDF, generated fresh from
// current DB state on every request - no file storage needed. Cloudinary
// was tried first, but it blocks direct PDF delivery under a default
// account-level security setting ("deny or ACL failure" on download), so
// this is served directly from our own backend instead. Deliberately
// unauthenticated: it's opened as a raw URL from inside the Stream Chat
// attachment UI, which can't attach an Authorization header.
const getAgreementPdf = async (req, res) => {
  try {
    const { agreementId } = req.params;
    const agreement = await Agreement.findById(agreementId);
    if (!agreement) {
      return res.status(404).send("Agreement not found");
    }
    const property = await Property.findById(agreement.PropertyId);
    if (!property) {
      return res.status(404).send("Property not found");
    }
    const owner = await User.findById(property.propertyowner);
    const tenant = await User.findById(agreement.buyerId);
    if (!owner || !tenant) {
      return res.status(404).send("Owner or tenant not found");
    }

    const effectiveRent = agreement.negotationPrice ?? property.rent;
    const pdfBuffer = await buildAgreementPdf({ property, owner, tenant, agreement, effectiveRent });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="HomeHub_Agreement_${agreementId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating agreement PDF:", error);
    res.status(500).send("Server error");
  }
};

// const myProperty = async (req, res) => {
//   try {
//     const myData = await Property.find(
//       {},
//       "_id title description type rent advance bachelor state city area address assest bedroom bathroom areaofhouse"
//     ).exec();
//     res.json(myData);
//   } catch (error) {
//     console.log(error);
//   }
// };

const getPropertyById = async (req, res) => {
  try {
    console.log("get property by id" , req.body)
    // Validate input
    if (!req.body.id) {
      return res.status(400).json({ error: "Property ID is required" });
    }

    // Fetch property from the database
    const property = await Property.findById(req.body.id)
      .populate("propertyowner") // Populate property owner details
      .exec();

    // Check if property exists
    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    // Send response
    res.status(200).json(property);
  } catch (error) {
    console.error("Error fetching property:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  createProperty,
  myProperty,
  freshRecommendation,
  aiRecommendProperties,
  makeAgreement,
  MyAgreement,
  agreementDetailShow,
  buyerDetail,
  AccceptAgreement,
  RejectAgreement,
  MakeNegotationPrice,
  pricePaid,
  DealDone,
  getPropertyById,
  getAgreementPdf,
  editProperty,
  deleteProperty,
};
