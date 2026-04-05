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
    /** UUID per table visit — isolates customer order list from previous guests at the same table */
    visitId: { type: String, trim: true, default: "", index: true },
    sessionId: { type: String, trim: true, default: "", index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },

    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },

    items: { type: [orderItemSchema], default: [] },

    /** Sum of line items (menu prices × qty) before discount */
    subtotalAmount: { type: Number, default: 0, min: 0 },
    /** Tax portion (computed server-side from cafe tax %) */
    taxAmount: { type: Number, default: 0, min: 0 },
    /** Discount applied (from cafe settings) */
    discountAmount: { type: Number, default: 0, min: 0 },
    /** Final amount payable (after discount + tax) */
    totalAmount: { type: Number, required: true, min: 0 },

    /** Customer-selected payment mode */
    paymentMode: {
      type: String,
      enum: ["cash", "upi"],
      default: "cash",
    },

    source: {
      type: String,
      enum: ["qr", "manual"],
      default: "qr",
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "baking", "preparing", "ready", "served", "paid", "rejected"],
      default: "pending",
      index: true,
    },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ cafeId: 1, createdAt: -1 });
orderSchema.index({ cafeId: 1, tableNumber: 1, visitId: 1 });
orderSchema.index({ cafeId: 1, tableNumber: 1, sessionId: 1 });
orderSchema.index({ cafeId: 1, tableNumber: 1, customerId: 1 });

module.exports = mongoose.model("Order", orderSchema);

