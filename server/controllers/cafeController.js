const Cafe = require("../models/Cafe");
const Table = require("../models/Table");

exports.listCafes = async (req, res) => {
  try {
    const cafes = await Cafe.find().sort({ createdAt: -1 });
    return res.json(cafes);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.getCafeById = async (req, res) => {
  try {
    const cafe = await Cafe.findById(req.params.id);
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });
    return res.json(cafe);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.createCafe = async (req, res) => {
  try {
    const { name, address, numberOfTables, logoUrl, brandImageUrl } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const cafe = await Cafe.create({
      name,
      address: address || "",
      numberOfTables: Number(numberOfTables || 0),
      logoUrl: logoUrl || "",
      brandImageUrl: brandImageUrl || "",
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

    const now = new Date();
    await Table.updateMany({ cafeId }, { $set: { sessionResetAt: now } });
    return res.json({ message: "Table sessions reset", sessionResetAt: now });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

