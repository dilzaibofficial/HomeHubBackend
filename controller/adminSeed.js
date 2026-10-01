const fs = require("fs");
const path = require("path");
const { requireAdmin } = require("./adminAuth");
const Property = require("../models/property");
const User = require("../models/user");

// Demo listings for client demos. The data lives in seed/demoProperties.json
// (generated once, images already hosted on Cloudinary) and is inserted from
// the admin panel's Properties page. Everything it creates carries
// seedBatch/seedKey so it is recognisable: seeding twice never duplicates,
// and "remove" deletes only these rows - never a real listing.
// Written straight to the collection (after being built through the
// Property model, so defaults/casting/validation match a normal listing) so
// the marker fields are kept - the schema itself is deliberately untouched.
const SEED_BATCH = "demo-seed-2026-10";
const SEED_FILE = path.join(__dirname, "..", "seed", "demoProperties.json");

const loadSpecs = () => JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));

const countSeeded = () => Property.collection.countDocuments({ seedBatch: SEED_BATCH });

const demoSeedStatus = async (req, res) => {
  try {
    requireAdmin(req);
    res.status(200).json({ seeded: await countSeeded(), total: loadSpecs().length });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

const seedDemoProperties = async (req, res) => {
  try {
    requireAdmin(req);
    const specs = loadSpecs();

    const users = await User.find({}, "_id email");
    const ownerIdByEmail = new Map(users.map((u) => [String(u.email || "").toLowerCase(), u._id]));

    const already = await Property.collection
      .find({ seedBatch: SEED_BATCH }, { projection: { seedKey: 1 } })
      .toArray();
    const alreadyKeys = new Set(already.map((d) => d.seedKey));

    const docs = [];
    const missingOwners = new Set();
    for (const spec of specs) {
      if (alreadyKeys.has(spec.seedKey)) continue;
      const ownerId = ownerIdByEmail.get(spec.ownerEmail.toLowerCase());
      if (!ownerId) {
        missingOwners.add(spec.ownerEmail);
        continue;
      }
      const property = new Property({
        title: spec.title,
        description: spec.description,
        type: spec.type,
        rent: spec.rent,
        advance: spec.advance,
        bachelor: spec.bachelor,
        state: spec.state,
        city: spec.city,
        area: spec.area,
        address: spec.address,
        coordinate: spec.coordinate,
        assest: spec.assest,
        bedroom: spec.bedroom,
        bathroom: spec.bathroom,
        areaofhouse: spec.areaofhouse,
        peoplesharing: spec.peoplesharing,
        propertyowner: ownerId,
      });
      await property.validate();
      const doc = property.toObject();
      doc.__v = 0;
      doc.seedBatch = SEED_BATCH;
      doc.seedKey = spec.seedKey;
      docs.push(doc);
    }

    if (docs.length > 0) {
      await Property.collection.insertMany(docs, { ordered: false });
    }

    res.status(200).json({
      message: docs.length > 0 ? `Added ${docs.length} demo properties` : "Demo properties are already added",
      inserted: docs.length,
      seeded: await countSeeded(),
      total: specs.length,
      missingOwners: [...missingOwners],
    });
  } catch (error) {
    console.error("Error seeding demo properties:", error);
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

// Only ever removes seeded rows, and leaves any that have since entered a
// real agreement/rental flow alone, so a demo deal in progress isn't pulled
// out from under an agreement record.
const removeDemoProperties = async (req, res) => {
  try {
    requireAdmin(req);
    const result = await Property.collection.deleteMany({
      seedBatch: SEED_BATCH,
      rented: { $ne: true },
      "propertySelling.agreement": { $ne: true },
    });
    res.status(200).json({
      message: `Removed ${result.deletedCount} demo properties`,
      deleted: result.deletedCount,
      seeded: await countSeeded(),
    });
  } catch (error) {
    console.error("Error removing demo properties:", error);
    res.status(error.status || 500).json({ message: error.message || "Server error" });
  }
};

module.exports = { demoSeedStatus, seedDemoProperties, removeDemoProperties };
