const mongoose = require("mongoose");

const cafeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, default: "", trim: true },
    numberOfTables: { type: Number, default: 0, min: 0 },
    logoUrl: { type: String, default: "", trim: true },
    brandImageUrl: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cafe", cafeSchema);

