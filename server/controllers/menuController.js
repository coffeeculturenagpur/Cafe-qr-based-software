const MenuItem = require('../models/MenuItem');

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

    const items = await MenuItem.find({ cafeId, isAvailable: true });
    return res.json(items);
}

// get items by category
exports.getItemsByCategory = async (req, res) => {
    const cafeId = getCafeIdFromRequest(req);
    const { category } = req.params;
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const items = await MenuItem.find({ cafeId, category, isAvailable: true });
    return res.json(items);
}

// Tenant-scoped menu listing
exports.getMenuByCafe = async (req, res) => {
    const cafeId = getCafeIdFromRequest(req);
    if (!cafeId) return res.status(400).json({ message: 'cafeId is required' });

    const items = await MenuItem.find({ cafeId, isAvailable: true });
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

        const items = await MenuItem.find({ cafeId }).sort({ createdAt: -1 });
        return res.json(items);
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};


