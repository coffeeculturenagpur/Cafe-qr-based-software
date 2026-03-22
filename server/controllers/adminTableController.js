const mongoose = require("mongoose");
const Cafe = require("../models/Cafe");
const Table = require("../models/Table");

function getCafeIdFromRequest(req) {
  if (req.user?.role === "super_admin") {
    return req.query.cafeId || req.body.cafeId || null;
  }
  return req.user?.cafeId || null;
}

exports.listTables = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const tables = await Table.find({ cafeId, isActive: true })
      .sort({ tableNumber: 1 })
      .lean();

    return res.json(tables);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.createTable = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const tableNumber = Number(req.body.tableNumber);
    if (!tableNumber || tableNumber < 1) {
      return res.status(400).json({ message: "tableNumber must be >= 1" });
    }

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });

    const existing = await Table.findOne({ cafeId, tableNumber });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        await existing.save();
        return res.status(201).json(existing);
      }
      return res.status(400).json({ message: "Table already exists" });
    }

    const created = await Table.create({
      cafeId: new mongoose.Types.ObjectId(cafeId),
      tableNumber,
      isActive: true,
    });

    if (tableNumber > Number(cafe.numberOfTables || 0)) {
      cafe.numberOfTables = tableNumber;
      await cafe.save();
    }

    return res.status(201).json(created);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.generateTables = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const cafe = await Cafe.findById(cafeId);
    if (!cafe) return res.status(404).json({ message: "Cafe not found" });

    const requestedCount = Number(req.body.numberOfTables || cafe.numberOfTables || 0);
    if (!requestedCount || requestedCount < 1) {
      return res.status(400).json({ message: "numberOfTables must be >= 1" });
    }

    if (cafe.numberOfTables !== requestedCount) {
      cafe.numberOfTables = requestedCount;
      await cafe.save();
    }

    const existing = await Table.find({ cafeId }).select("tableNumber isActive").lean();
    const existingMap = new Map(existing.map((t) => [t.tableNumber, Boolean(t.isActive)]));

    const toCreate = [];
    const toReactivate = [];
    for (let i = 1; i <= requestedCount; i += 1) {
      if (!existingMap.has(i)) {
        toCreate.push({ cafeId: new mongoose.Types.ObjectId(cafeId), tableNumber: i });
      } else if (!existingMap.get(i)) {
        toReactivate.push(i);
      }
    }

    if (toCreate.length > 0) {
      await Table.insertMany(toCreate);
    }
    if (toReactivate.length > 0) {
      await Table.updateMany(
        { cafeId, tableNumber: { $in: toReactivate } },
        { $set: { isActive: true } }
      );
    }

    const tables = await Table.find({ cafeId, isActive: true }).sort({ tableNumber: 1 }).lean();
    return res.json({ created: toCreate.length, total: tables.length, tables });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.deleteTable = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    const { id } = req.params;
    const table = await Table.findOne({ _id: id, cafeId });
    if (!table) return res.status(404).json({ message: "Table not found" });

    await Table.deleteOne({ _id: id, cafeId });

    return res.json({ message: "Table deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.deleteAllTables = async (req, res) => {
  try {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: "cafeId is required" });

    await Table.deleteMany({ cafeId });
    await Cafe.findByIdAndUpdate(cafeId, { numberOfTables: 0 });

    return res.json({ message: "All tables deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error });
  }
};
