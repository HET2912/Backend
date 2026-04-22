const mongoose = require("mongoose");

const oneToOneEntrySchema = new mongoose.Schema(
  {
    // signed number: +amount when you owe them, -amount when they owe you
    value: { type: Number, required: true },
    reason: { type: String, default: "", trim: true },
    owe: { type: Boolean, required: true },
    date: { type: Date, required: true, default: Date.now },
  },
  // keep _id so we can edit/delete individual entries from frontend
);

const oneToOneSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    // Each entry has its own reason + signed amount
    amount: {
      type: [oneToOneEntrySchema],
      default: [],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

oneToOneSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("OneToOne", oneToOneSchema);

