const mongoose = require("mongoose");

const otpTokenSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Automatically delete documents when `expiresAt` is reached.
otpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OtpToken", otpTokenSchema);
