const Cafe = require("../models/Cafe");
const Table = require("../models/Table");
const MenuItem = require("../models/MenuItem");
const Order = require("../models/Order");
const { canAccessCafe, forbiddenTenant } = require("../utils/tenant");

exports.listCafes = async (req, res) => {
  try {
    const cafes = await Cafe.find().sort({ createdAt: -1 }).lean();
    return res.json(cafes);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.getCafeById = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id).lean();
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });
    return res.json(cafe);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.createCafe = async (req, res) => {
  try {
    const { name, address, numberOfTables, logoUrl, brandImageUrl, taxPercent, discountType, discountValue, discountPercent, showcaseHighlights, showcaseCommunityNotes, showcaseCommunityShots, showcaseNonSmokingShots } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const cafe = await Cafe.create({
      name,
      address: address || "",
      numberOfTables: Number(numberOfTables || 0),
      logoUrl: logoUrl || "",
      brandImageUrl: brandImageUrl || "",
      taxPercent: typeof taxPercent !== "undefined" ? Number(taxPercent || 0) : 0,
      discountType: typeof discountType === "string" ? discountType : "percent",
      discountValue: typeof discountValue !== "undefined"
        ? Number(discountValue || 0)
        : typeof discountPercent !== "undefined"
          ? Number(discountPercent || 0)
          : 0,
      showcaseHighlights: Array.isArray(showcaseHighlights)
        ? showcaseHighlights.map((it = {}) => ({
            name: typeof it.name === "string" ? it.name : "",
            note: typeof it.note === "string" ? it.note : "",
            tag: typeof it.tag === "string" ? it.tag : "",
            price: typeof it.price !== "undefined" ? Number(it.price || 0) : 0,
            image: typeof it.image === "string" ? it.image : "",
          }))
        : undefined,
      showcaseCommunityNotes: Array.isArray(showcaseCommunityNotes)
        ? showcaseCommunityNotes.map((it = {}) => ({
            quote: typeof it.quote === "string" ? it.quote : "",
            name: typeof it.name === "string" ? it.name : "",
            tag: typeof it.tag === "string" ? it.tag : "",
          }))
        : undefined,
      showcaseCommunityShots: Array.isArray(showcaseCommunityShots)
        ? showcaseCommunityShots.filter((s) => typeof s === "string").map((s) => s)
        : undefined,
      showcaseNonSmokingShots: Array.isArray(showcaseNonSmokingShots)
        ? showcaseNonSmokingShots.filter((s) => typeof s === "string").map((s) => s)
        : undefined,
    });

    const tableCount = cafe.numberOfTables || 0;
    if (tableCount > 0) {
      const tables = Array.from({ length: tableCount }, (_, idx) => ({
        cafeId: cafe._id,
        tableNumber: idx + 1,
      }));
      await Table.insertMany(tables);
    }

    return res.status(201).json(cafe);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.resetTableSessions = async (req, res) => {
  try {
    const { cafeId } = req.body;
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });
    if (!canAccessCafe(req.user, cafeId)) {
      return forbiddenTenant(res);
    }

    const now = new Date();
    await Table.updateMany({ cafeId }, { $set: { sessionResetAt: now } });
    return res.json({ message: "Table sessions reset", sessionResetAt: now });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.updateCafe = async (req, res) => {
  try {
    const { name, address, numberOfTables, logoUrl, brandImageUrl, isActive, taxPercent, discountType, discountValue, discountPercent, showcaseHighlights, showcaseCommunityNotes, showcaseCommunityShots, showcaseNonSmokingShots } = req.body;
    const updates = {};
    if (typeof name === "string") updates.name = name;
    if (typeof address === "string") updates.address = address;
    if (typeof numberOfTables !== "undefined") updates.numberOfTables = Number(numberOfTables || 0);
    if (typeof logoUrl === "string") updates.logoUrl = logoUrl;
    if (typeof brandImageUrl === "string") updates.brandImageUrl = brandImageUrl;
    if (typeof taxPercent !== "undefined") updates.taxPercent = Number(taxPercent || 0);
    if (typeof discountType === "string") updates.discountType = discountType;
    if (typeof discountValue !== "undefined") {
      updates.discountValue = Number(discountValue || 0);
    } else if (typeof discountPercent !== "undefined") {
      updates.discountType = "percent";
      updates.discountValue = Number(discountPercent || 0);
    }
    if (typeof isActive !== "undefined") updates.isActive = Boolean(isActive);
    if (typeof req.body.latitude !== "undefined") updates.latitude = req.body.latitude === null ? null : Number(req.body.latitude);
    if (typeof req.body.longitude !== "undefined") updates.longitude = req.body.longitude === null ? null : Number(req.body.longitude);
    if (typeof req.body.serviceRadiusMeters !== "undefined") {
      updates.serviceRadiusMeters = Number(req.body.serviceRadiusMeters || 0);
    }
    if (typeof req.body.primaryColor === "string") updates.primaryColor = req.body.primaryColor;
    if (typeof req.body.accentColor === "string") updates.accentColor = req.body.accentColor;
    if (typeof req.body.venueTimezone === "string") updates.venueTimezone = req.body.venueTimezone;
    if (Array.isArray(showcaseHighlights)) {
      updates.showcaseHighlights = showcaseHighlights.map((it = {}) => ({
        name: typeof it.name === "string" ? it.name : "",
        note: typeof it.note === "string" ? it.note : "",
        tag: typeof it.tag === "string" ? it.tag : "",
        price: typeof it.price !== "undefined" ? Number(it.price || 0) : 0,
        image: typeof it.image === "string" ? it.image : "",
      }));
    }
    if (Array.isArray(showcaseCommunityNotes)) {
      updates.showcaseCommunityNotes = showcaseCommunityNotes.map((it = {}) => ({
        quote: typeof it.quote === "string" ? it.quote : "",
        name: typeof it.name === "string" ? it.name : "",
        tag: typeof it.tag === "string" ? it.tag : "",
      }));
    }
    if (Array.isArray(showcaseCommunityShots)) {
      updates.showcaseCommunityShots = showcaseCommunityShots.filter((s) => typeof s === "string").map((s) => s);
    }
    if (Array.isArray(showcaseNonSmokingShots)) {
      updates.showcaseNonSmokingShots = showcaseNonSmokingShots
        .filter((s) => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    const cafe = await Cafe.findByIdAndUpdate(req.params.id, updates, { new: true, strict: false });
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });
    return res.json(cafe);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.deleteCafe = async (req, res) => {
  try {
    const cafeId = req.params.id;
    const cafe = await Cafe.findById(cafeId);
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });

    await Promise.all([
      Table.deleteMany({ cafeId }),
      MenuItem.deleteMany({ cafeId }),
      Order.deleteMany({ cafeId }),
    ]);
    await cafe.deleteOne();

    return res.json({ message: "Cafe deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

