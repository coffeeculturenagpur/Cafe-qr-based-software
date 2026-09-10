const mongoose = require("mongoose");
const MenuItem = require("../models/MenuItem");
const Cafe = require("../models/Cafe");
const { buildCigaretteCategorySet, isCigaretteCategory } = require("../utils/cigarettes");
const { canAccessCafe, forbiddenTenant } = require("../utils/tenant");

let parse = null;
try {
  ({ parse } = require("csv-parse/sync"));
} catch (e) {
  try {
    ({ parse } = require("csv-parse/lib/sync"));
  } catch (e2) {
    parse = null;
  }
}

let XLSX = null;
try {
  // eslint-disable-next-line global-require
  XLSX = require("xlsx");
} catch (e) {
  XLSX = null;
}

function toValidObjectId(id) {
  if (!id) return null;
  const str = String(id).trim();
  if (mongoose.Types.ObjectId.isValid(str)) {
    return new mongoose.Types.ObjectId(str);
  }
  return null;
}

const getCafeIdFromRequest = (req) => {
  return req.params?.cafeId || req.query?.cafeId || req.body?.cafeId || null;
};

const getCafeIdForWrite = (req) => {
  if (req.user?.role === "super_admin") {
    return req.body?.cafeId || req.query?.cafeId || req.params?.cafeId || null;
  }
  return req.user?.cafeId || req.body?.cafeId || req.query?.cafeId || null;
};

async function getCigaretteCategorySetForCafe(cafeId) {
  const cafe = await Cafe.findById(cafeId).select("cigaretteCategories").lean();
  return buildCigaretteCategorySet(cafe || {});
}

function excludeCigaretteItems(items, categorySet) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => !isCigaretteCategory(item?.category, categorySet)
  );
}

// get all items (customer / QR — cigarettes excluded; counter-only)
exports.getAvailableItems = async (req, res) => {
  try {
    const rawCafeId = getCafeIdFromRequest(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const categorySet = await getCigaretteCategorySetForCafe(cafeId);
    const items = await MenuItem.find({ cafeId, isAvailable: true }).sort({ category: 1, name: 1 }).lean();
    return res.json(excludeCigaretteItems(items, categorySet));
  } catch (error) {
    console.error("getAvailableItems error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

// get items by category
exports.getItemsByCategory = async (req, res) => {
  try {
    const rawCafeId = getCafeIdFromRequest(req);
    const { category } = req.params;
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const categorySet = await getCigaretteCategorySetForCafe(cafeId);
    if (isCigaretteCategory(category, categorySet)) {
      return res.json([]);
    }

    const items = await MenuItem.find({ cafeId, category, isAvailable: true }).sort({ name: 1 }).lean();
    return res.json(items);
  } catch (error) {
    console.error("getItemsByCategory error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

// Tenant-scoped menu listing (customer / QR — cigarettes excluded)
exports.getMenuByCafe = async (req, res) => {
  try {
    const rawCafeId = getCafeIdFromRequest(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const categorySet = await getCigaretteCategorySetForCafe(cafeId);
    const items = await MenuItem.find({ cafeId, isAvailable: true }).sort({ category: 1, name: 1 }).lean();
    return res.json(excludeCigaretteItems(items, categorySet));
  } catch (error) {
    console.error("getMenuByCafe error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

/** Staff menu including cigarette items (counter sales). */
exports.getStaffMenuByCafe = async (req, res) => {
  try {
    const rawCafeId = getCafeIdFromRequest(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });
    if (!canAccessCafe(req.user, String(cafeId))) return forbiddenTenant(res);

    const items = await MenuItem.find({ cafeId, isAvailable: true }).sort({ category: 1, name: 1 }).lean();
    return res.json(items);
  } catch (error) {
    console.error("getStaffMenuByCafe error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

// Add a new item
exports.adddMenuItem = async (req, res) => {
  try {
    const rawCafeId = getCafeIdForWrite(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const newItem = new MenuItem({ ...req.body, cafeId });
    await newItem.save();
    return res.status(201).json(newItem);
  } catch (error) {
    console.error("adddMenuItem error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

// Edit item
exports.updateMenuItem = async (req, res) => {
  try {
    const rawCafeId = getCafeIdForWrite(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const updatedItem = await MenuItem.findOneAndUpdate(
      { _id: req.params.id, cafeId },
      { ...req.body, cafeId },
      { new: true }
    );
    if (!updatedItem) return res.status(404).json({ message: "Item not found" });
    return res.json(updatedItem);
  } catch (error) {
    console.error("updateMenuItem error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

// delete an item
exports.deleteMenuItem = async (req, res) => {
  try {
    const rawCafeId = getCafeIdForWrite(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const deleted = await MenuItem.findOneAndDelete({ _id: req.params.id, cafeId });
    if (!deleted) return res.status(404).json({ message: "Item not found" });
    return res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("deleteMenuItem error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

exports.toggleAvailability = async (req, res) => {
  try {
    const rawCafeId = getCafeIdForWrite(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const item = await MenuItem.findOne({ _id: req.params.id, cafeId });
    if (!item) return res.status(404).json({ message: "Item not found" });
    item.isAvailable = !item.isAvailable;
    await item.save();
    return res.json(item);
  } catch (error) {
    console.error("toggleAvailability error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

// Admin-only tenant-scoped listing (includes unavailable items)
exports.listAdminMenuItems = async (req, res) => {
  try {
    const rawCafeId = getCafeIdForWrite(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const items = await MenuItem.find({ cafeId }).sort({ createdAt: -1 }).lean();
    return res.json(items);
  } catch (error) {
    console.error("listAdminMenuItems error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

exports.deleteAllMenuItems = async (req, res) => {
  try {
    const rawCafeId = getCafeIdForWrite(req);
    if (!rawCafeId) return res.status(400).json({ message: "cafeId is required" });
    const cafeId = toValidObjectId(rawCafeId);
    if (!cafeId) return res.status(400).json({ message: "Invalid cafeId" });

    const result = await MenuItem.deleteMany({ cafeId });
    return res.json({ message: "All menu items deleted", deleted: result?.deletedCount || 0 });
  } catch (error) {
    console.error("deleteAllMenuItems error:", error);
    return res.status(500).json({ message: error.message || "Server error", error: error.message });
  }
};

function normalizeKey(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getRowValue(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  const normalizedMap = {};
  for (const [k, v] of Object.entries(row)) {
    normalizedMap[normalizeKey(k)] = v;
  }
  for (const key of keys) {
    const nk = normalizeKey(key);
    if (normalizedMap[nk] !== undefined && normalizedMap[nk] !== null && String(normalizedMap[nk]).trim() !== "") {
      return String(normalizedMap[nk]).trim();
    }
  }
  return "";
}

function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "available", "active", "in_stock", "t"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "unavailable", "inactive", "out_of_stock", "f"].includes(normalized)) return false;
  return fallback;
}

function parsePrice(raw) {
  if (typeof raw === "number") return raw;
  if (!raw) return NaN;
  let s = String(raw)
    .trim()
    .replace(/^(rs\.?|inr|usd|\$|₹|€|£)\s*/i, "")
    .replace(/\/-$/, "")
    .replace(/,/g, "")
    .trim();
  s = s.replace(/[^0-9.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) {
    s = parts[0] + "." + parts.slice(1).join("");
  }
  const num = parseFloat(s);
  return Number.isNaN(num) ? NaN : num;
}

function detectDelimiter(csvText) {
  const firstLine = csvText.split(/\r\n|\r|\n/).find((line) => line.trim().length > 0) || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  if (semicolonCount > commaCount && semicolonCount > tabCount) return ";";
  if (tabCount > commaCount && tabCount > semicolonCount) return "\t";
  return ",";
}

function parseCsvBuffer(fileBuffer) {
  if (!fileBuffer || !fileBuffer.length) {
    throw new Error("Uploaded file is empty");
  }

  const csvText = fileBuffer.toString("utf8").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(csvText);

  if (parse) {
    try {
      return parse(csvText, {
        delimiter,
        columns: (header) => header.map((h) => (h ? String(h).trim().replace(/^\uFEFF/, "") : "")),
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
        relax_quotes: true,
      });
    } catch (parseErr) {
      // Fall through to manual parser
    }
  }

  // Pure JavaScript RFC 4180 CSV parser fallback
  const lines = [];
  let row = [];
  let inQuotes = false;
  let curr = "";

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    const next = csvText[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        curr += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      row.push(curr.trim());
      curr = "";
    } else if ((c === "\r" || c === "\n") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(curr.trim());
      if (row.some((v) => v !== "")) lines.push(row);
      row = [];
      curr = "";
    } else {
      curr += c;
    }
  }
  if (curr.length > 0 || row.length > 0) {
    row.push(curr.trim());
    if (row.some((v) => v !== "")) lines.push(row);
  }

  if (lines.length < 2) return [];
  const headers = lines[0].map((h) => h.replace(/^["']|["']$/g, "").trim());
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i];
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx].replace(/^["']|["']$/g, "").trim() : "";
    });
    records.push(obj);
  }
  return records;
}

function parseFileBuffer(fileBuffer, originalName = "") {
  if (!fileBuffer || !fileBuffer.length) {
    throw new Error("Uploaded file is empty");
  }

  const isExcel = /\.(xlsx|xls)$/i.test(originalName);
  if (isExcel) {
    if (!XLSX) {
      throw new Error("Excel upload requires `xlsx` package to be installed on the server. Please upload a CSV file or install `xlsx`.");
    }
    try {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("Excel file has no sheets");
      const worksheet = workbook.Sheets[firstSheetName];
      return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
    } catch (err) {
      throw new Error(`Failed to parse Excel file: ${err.message}`);
    }
  }

  return parseCsvBuffer(fileBuffer);
}

function validateMenuCsv(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { items: [], rowErrors: [{ row: 1, message: "File contains no data rows" }] };
  }

  const items = [];
  const rowErrors = [];
  const nameMap = new Map();

  records.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      rowErrors.push({ row: index + 2, message: "Invalid row structure" });
      return;
    }

    const name = getRowValue(row, "name", "itemName", "item_name", "item", "dish", "dishName", "title");
    const rawPrice = getRowValue(row, "price", "rate", "cost", "amount", "unitPrice");
    const price = parsePrice(rawPrice);

    if (!name) {
      rowErrors.push({ row: index + 2, message: "Missing item name" });
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      rowErrors.push({ row: index + 2, message: `Invalid price "${rawPrice || ""}"` });
      return;
    }

    const category = getRowValue(row, "category", "cat", "group", "section") || "Uncategorized";
    const description = getRowValue(row, "description", "desc", "details", "info");

    const rawType = getRowValue(row, "type", "diet", "veg/non-veg", "vegnonveg", "veg_non_veg", "foodType").toLowerCase();
    let type = "veg";
    if (rawType.includes("non") || rawType === "nv" || rawType === "nveg") {
      type = "non-veg";
    } else if (rawType.includes("insight") || rawType === "customer-insights") {
      type = "customer-insights";
    } else {
      type = "veg";
    }

    const image = getRowValue(row, "image", "imageUrl", "image_url", "photo", "img", "picture");
    const rawSpecial = getRowValue(row, "isSpecial", "special", "is_special", "featured", "chefSpecial");
    const rawAvailable = getRowValue(row, "isAvailable", "available", "is_available", "inStock", "stock");

    const isSpecial = parseBool(rawSpecial, false);
    const isAvailable = rawAvailable ? parseBool(rawAvailable, true) : true;

    const item = {
      name,
      description,
      price,
      category,
      type,
      image,
      isSpecial,
      isAvailable,
    };

    if (nameMap.has(name.toLowerCase())) {
      rowErrors.push({ row: index + 2, message: `Duplicate item name "${name}" in file (first occurrence kept)` });
      return;
    }
    nameMap.set(name.toLowerCase(), true);
    items.push(item);
  });

  return { items, rowErrors };
}

exports.bulkUploadMenuItems = async (req, res) => {
  try {
    const rawCafeId = getCafeIdForWrite(req);
    if (!rawCafeId) {
      return res.status(400).json({ message: "cafeId is required" });
    }

    const cafeObjectId = toValidObjectId(rawCafeId);
    if (!cafeObjectId) {
      return res.status(400).json({ message: `Invalid cafeId "${rawCafeId}". Must be a valid 24-character ObjectId.` });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    let records;
    try {
      records = parseFileBuffer(req.file.buffer, req.file.originalname || "");
    } catch (parseErr) {
      return res.status(400).json({
        message: parseErr.message || "Failed to parse uploaded file",
        error: parseErr.message,
      });
    }

    const { items, rowErrors } = validateMenuCsv(records);

    if (items.length === 0) {
      return res.status(400).json({
        message: "No valid menu items found in file",
        errors: rowErrors,
      });
    }

    // Upsert by name (case-insensitive) for this cafe using BSON ObjectId
    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: {
          cafeId: cafeObjectId,
          name: new RegExp(`^${item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        },
        update: {
          $set: {
            name: item.name,
            description: item.description,
            price: item.price,
            category: item.category,
            type: item.type,
            image: item.image,
            isSpecial: item.isSpecial,
            isAvailable: item.isAvailable,
            cafeId: cafeObjectId,
          },
        },
        upsert: true,
      },
    }));

    const result = await MenuItem.bulkWrite(bulkOps, { ordered: false });
    const created = result?.upsertedCount || 0;
    const updated = result?.modifiedCount || 0;

    return res.json({
      message: `Successfully processed ${items.length} items (${created} created, ${updated} updated)`,
      created,
      updated,
      total: items.length,
      skipped: rowErrors.length,
      errors: rowErrors,
    });
  } catch (error) {
    console.error("bulkUploadMenuItems error:", error);
    return res.status(500).json({
      message: error.message || "Server error during bulk upload",
      error: error.message,
    });
  }
};

exports.previewMenuCsv = async (req, res) => {
  try {
    const rawCafeId = getCafeIdForWrite(req);
    if (!rawCafeId) {
      return res.status(400).json({ message: "cafeId is required" });
    }

    const cafeObjectId = toValidObjectId(rawCafeId);
    if (!cafeObjectId) {
      return res.status(400).json({ message: `Invalid cafeId "${rawCafeId}". Must be a valid 24-character ObjectId.` });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    let records;
    try {
      records = parseFileBuffer(req.file.buffer, req.file.originalname || "");
    } catch (parseErr) {
      return res.status(400).json({
        message: parseErr.message || "Failed to parse uploaded file",
        error: parseErr.message,
      });
    }

    const { items, rowErrors } = validateMenuCsv(records);

    return res.json({
      total: items.length,
      skipped: rowErrors.length,
      errors: rowErrors,
      preview: items,
    });
  } catch (error) {
    console.error("previewMenuCsv error:", error);
    return res.status(500).json({
      message: error.message || "Server error during preview",
      error: error.message,
    });
  }
};
