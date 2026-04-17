const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    incomeSource: {
      type: String,
      enum: ["salary", "business", "freelance", "investment", "investments", "other"],
      default: "other",
    },
    phoneNumber: {
      type: String,
      default: "",
      trim: true,
    },
    monthlyIncome: {
      type: Number,
      min: 0,
      default: 0,
    },
    preferredCurrency: {
      type: String,
      default: "USD",
      trim: true,
      uppercase: true,
    },
    profilePicture: {
      type: String,
      default: "",
      trim: true,
    },
    // One-to-many references to related entities.
    transactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Transaction",
      },
    ],
    investments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Investment",
      },
    ],
    wishlists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "WishlistItem",
      },
    ],
    groups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
      },
    ],
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
