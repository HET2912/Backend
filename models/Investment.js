const mongoose = require("mongoose");

const investmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      default: "other",
      enum: [
        "stocks",
        "mutual-funds",
        "fixed-deposit",
        "other",
        "emergency-fund",
        "short-term",
        "long-term",
        "monthly-buffer",
      ],
    },
    entryType: {
      type: String,
      enum: ["deposit", "withdrawal"],
      default: "deposit",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      min: 0,
    },
    investedAmount: {
      type: Number,
      min: 0,
    },
    currentValue: {
      type: Number,
      min: 0,
    },
    durationMonths: {
      type: Number,
      min: 1,
      default: 1,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const Investment = mongoose.model("Investment", investmentSchema);

module.exports = Investment;
