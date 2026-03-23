const mongoose = require("mongoose");

const cafeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, default: "", trim: true },
    numberOfTables: { type: Number, default: 0, min: 0 },
    logoUrl: { type: String, default: "", trim: true },
    brandImageUrl: { type: String, default: "", trim: true },
    upiQrUrl: { type: String, default: "", trim: true },
    taxPercent: { type: Number, default: 0, min: 0 },
    discountType: { type: String, enum: ["percent", "fixed"], default: "percent" },
    discountValue: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    /** Optional geofence: ordering requires client coords within radius (meters) */
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    serviceRadiusMeters: { type: Number, default: 0, min: 0 },
    /** Owner-configured theme (applied via CSS variables on customer app) */
    primaryColor: { type: String, default: "", trim: true },
    accentColor: { type: String, default: "", trim: true },
    venueTimezone: { type: String, default: "UTC", trim: true },
    /** Marketing site content */
    showcaseHighlights: [
      {
        name: { type: String, default: "", trim: true },
        note: { type: String, default: "", trim: true },
        tag: { type: String, default: "", trim: true },
        price: { type: Number, default: 0, min: 0 },
        image: { type: String, default: "", trim: true },
      },
    ],
    showcaseCommunityNotes: [
      {
        quote: { type: String, default: "", trim: true },
        name: { type: String, default: "", trim: true },
        tag: { type: String, default: "", trim: true },
      },
    ],
    showcaseCommunityShots: [{ type: String, default: "", trim: true }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cafe", cafeSchema);

