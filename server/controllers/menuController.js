const MenuItem = require('../models/MenuItem');
let parse = null;
try {
    // csv-parse v5 supports sync parsing from `csv-parse/sync`
    ({ parse } = require("csv-parse/sync"));
} catch (e) {
    try {
        // Some builds expose it from this path
        ({ parse } = require("csv-parse/lib/sync"));
    } catch (e2) {
        parse = null; // handled at runtime only for CSV endpoints
    }
}

const getCafeIdFromRequest = (req) => req.params.cafeId || req.query.cafeId || req.body.cafeId;
const getCafeIdForWrite = (req) => {
    if (req.user?.role === 'super_admin') {
        return req.body?.cafeId || req.query?.cafeId || req.params?.cafeId || null;
    }
    return req.user?.cafeId || null;
};

//get all items
exports.getAvailableItems = async (req, res) => {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const items = await MenuItem.find({ cafeId, isAvailable: true }).sort({ category: 1, name: 1 }).lean();
    return res.json(items);
}

// get items by category
exports.getItemsByCategory = async (req, res) => {
    const cafeId = getCafeIdFromRequest(req);
    const { category } = req.params;
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const items = await MenuItem.find({ cafeId, category, isAvailable: true }).sort({ name: 1 }).lean();
    return res.json(items);
}

// Tenant-scoped menu listing
exports.getMenuByCafe = async (req, res) => {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const items = await MenuItem.find({ cafeId, isAvailable: true }).sort({ category: 1, name: 1 }).lean();
    return res.json(items);
};

//Add a new item
exports.adddMenuItem = async (req, res) => {
    const cafeId = getCafeIdForWrite(req);
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const newItem = new MenuItem({ ...req.body, cafeId });
    await newItem.save();
    res.status(201).json(newItem);
};

// Edit item
exports.updateMenuItem = async (req, res) => {
    const cafeId = getCafeIdForWrite(req);
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const updatedItem = await MenuItem.findOneAndUpdate(
        { _id: req.params.id, cafeId },
        { ...req.body, cafeId },
        { new: true }
    );
    if (!updatedItem) return res.status(404).json({ message: 'Item not found' });
    return res.json(updatedItem);
};

//delete an item
exports.deleteMenuItem = async (req, res) => {
    const cafeId = getCafeIdForWrite(req);
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const deleted = await MenuItem.findOneAndDelete({ _id: req.params.id, cafeId });
    if (!deleted) return res.status(404).json({ message: 'Item not found' });
    return res.json({ message: 'Item deleted Successfully ' });
};

exports.toggleAvailability = async (req, res) => {
    const cafeId = getCafeIdForWrite(req);
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const item = await MenuItem.findOne({ _id: req.params.id, cafeId });
    if (!item) return res.status(404).json({ message: 'Item not found' });
    item.isAvailable = !item.isAvailable;
    await item.save();
    res.json(item);
}

// Admin-only tenant-scoped listing (includes unavailable items)
exports.listAdminMenuItems = async (req, res) => {
    try {
        const cafeId = getCafeIdForWrite(req);
        if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

        const items = await MenuItem.find({ cafeId }).sort({ createdAt: -1 }).lean();
        return res.json(items);
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

exports.deleteAllMenuItems = async (req, res) => {
    try {
        const cafeId = getCafeIdForWrite(req);
        if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

        const result = await MenuItem.deleteMany({ cafeId });
        return res.json({ message: "All menu items deleted", deleted: result?.deletedCount || 0 });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

function parseBool(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
    return fallback;
}

function validateMenuCsv(records) {
    if (!Array.isArray(records) || records.length === 0) {
        return { items: [], rowErrors: [{ row: 1, message: "CSV is empty" }] };
    }

    const items = [];
    const rowErrors = [];
    const nameMap = new Map();

    records.forEach((row, index) => {
        const name = String(row.name || row.title || "").trim();
        const price = Number(row.price || 0);
        if (!name) {
            rowErrors.push({ row: index + 2, message: "Missing name" });
            return;
        }
        if (!price || Number.isNaN(price)) {
            rowErrors.push({ row: index + 2, message: "Invalid price" });
            return;
        }

        const category = String(row.category || "Uncategorized").trim() || "Uncategorized";
        const description = String(row.description || "").trim();
        const typeRaw = String(row.type || "veg").trim().toLowerCase();
        const type = ["veg", "non-veg", "customer-insights"].includes(typeRaw) ? typeRaw : "veg";
        const image = String(row.image || row.imageUrl || row.image_url || "").trim();
        const isSpecial = parseBool(row.isSpecial ?? row.special, false);
        const isAvailable = parseBool(row.isAvailable ?? row.available, true);

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
            rowErrors.push({ row: index + 2, message: `Duplicate name "${name}" in CSV` });
            return;
        }
        nameMap.set(name.toLowerCase(), true);
        items.push(item);
    });

    return { items, rowErrors };
}

function parseCsvBuffer(fileBuffer) {
    if (!parse) {
        throw new Error(
            'CSV parser is not available. Ensure `csv-parse/sync` is installed correctly on the server.'
        );
    }
    const csvText = fileBuffer.toString("utf8");
    return parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });
}

exports.bulkUploadMenuItems = async (req, res) => {
    try {
        const cafeId = getCafeIdForWrite(req);
        if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });
        if (!req.file?.buffer) return res.status(400).json({ message: "CSV file is required" });

        const records = parseCsvBuffer(req.file.buffer);
        const { items, rowErrors } = validateMenuCsv(records);

        if (items.length === 0) {
            return res.status(400).json({ message: "No valid rows found", errors: rowErrors });
        }

        // Upsert by name (case-insensitive) for this cafe.
        const bulkOps = items.map((item) => ({
            updateOne: {
                filter: { cafeId, name: new RegExp(`^${item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
                update: { $set: { ...item, cafeId } },
                upsert: true,
            },
        }));

        const result = await MenuItem.bulkWrite(bulkOps, { ordered: false });
        const created = result?.upsertedCount || 0;
        const updated = result?.modifiedCount || 0;

        return res.json({
            created,
            updated,
            total: items.length,
            skipped: rowErrors.length,
            errors: rowErrors,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

exports.previewMenuCsv = async (req, res) => {
    try {
        const cafeId = getCafeIdForWrite(req);
        if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });
        if (!req.file?.buffer) return res.status(400).json({ message: "CSV file is required" });

        const records = parseCsvBuffer(req.file.buffer);
        const { items, rowErrors } = validateMenuCsv(records);

        return res.json({
            total: items.length,
            skipped: rowErrors.length,
            errors: rowErrors,
            preview: items,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};


