const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    cafeId: { type: mongoose.Schema.Types.ObjectId, ref: "Cafe", required: true, index: true },
    tableNumber: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true },
    sessionResetAt: { type: Date, default: null },
  },
  { timestamps: true }
);

tableSchema.index({ cafeId: 1, tableNumber: 1 }, { unique: true });

module.exports = mongoose.model("Table", tableSchema);

