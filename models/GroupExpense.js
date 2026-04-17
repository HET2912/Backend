const mongoose = require("mongoose");

const splitMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    share: {
      type: Number,
      required: true,
      min: 0,
    },
    settled: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const groupExpenseSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    splitBetween: {
      type: [splitMemberSchema],
      default: [],
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    attachmentUrl: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const GroupExpense = mongoose.model("GroupExpense", groupExpenseSchema);

module.exports = GroupExpense;
