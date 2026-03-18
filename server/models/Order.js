const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", default: null },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    cafeId: { type: mongoose.Schema.Types.ObjectId, ref: "Cafe", required: true, index: true },
    tableNumber: { type: Number, required: true, min: 1 },

    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },

    items: { type: [orderItemSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ["pending", "preparing", "ready", "served", "paid"],
      default: "pending",
      index: true,
    },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ cafeId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);

