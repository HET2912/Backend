const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    // null means predefined system category visible to all users.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      default: "",
      trim: true,
    },
    color: {
      type: String,
      default: "#6B7280",
      trim: true,
    },
    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
      default: "expense",
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Prevent duplicate category names in the same scope (global or per user).
categorySchema.index({ userId: 1, name: 1 }, { unique: true });

const Category = mongoose.model("Category", categorySchema);

module.exports = Category;
