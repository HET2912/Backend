const mongoose = require("mongoose");
const WishlistItem = require("../models/WishlistItem");
const Investment = require("../models/Investment");

const getAvailableSavingsBalance = async (userId) => {
  const savingsEntries = await Investment.find({ userId }).select("entryType amount investedAmount");
  const totalSavingsBalance = savingsEntries.reduce((total, entry) => {
    const amount = Number(entry.amount ?? entry.investedAmount ?? 0);
    return entry.entryType === "withdrawal" ? total - amount : total + amount;
  }, 0);

  const lockedGoals = await WishlistItem.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
    {
      $group: {
        _id: null,
        totalLocked: { $sum: "$savedAmount" },
      },
    },
  ]);

  const lockedAmount = Number(lockedGoals[0]?.totalLocked || 0);
  return {
    totalSavingsBalance,
    lockedAmount,
    availableSavingsBalance: Math.max(0, totalSavingsBalance - lockedAmount),
  };
};

const createGoal = async (req, res, next) => {
  try {
    const { itemName, targetAmount, deadline } = req.body;
    if (!itemName || targetAmount === undefined) {
      const error = new Error("itemName and targetAmount are required");
      error.statusCode = 400;
      return next(error);
    }

    const goal = await WishlistItem.create({
      userId: req.user._id,
      itemName,
      targetAmount,
      savedAmount: 0,
      deadline,
    });

    return res.status(201).json({ success: true, goal });
  } catch (err) {
    return next(err);
  }
};

const getGoals = async (req, res, next) => {
  try {
    const goals = await WishlistItem.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: goals.length, goals });
  } catch (err) {
    return next(err);
  }
};

const updateGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid goal id");
      error.statusCode = 400;
      return next(error);
    }

    const updates = {};
    ["itemName", "targetAmount", "deadline", "status"].forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const goal = await WishlistItem.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!goal) {
      const error = new Error("Goal not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({ success: true, goal });
  } catch (err) {
    return next(err);
  }
};

const deleteGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid goal id");
      error.statusCode = 400;
      return next(error);
    }

    const goal = await WishlistItem.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!goal) {
      const error = new Error("Goal not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({ success: true, message: "Goal deleted successfully" });
  } catch (err) {
    return next(err);
  }
};

const addSavings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid goal id");
      error.statusCode = 400;
      return next(error);
    }
    if (!amount || Number(amount) <= 0) {
      const error = new Error("amount must be greater than 0");
      error.statusCode = 400;
      return next(error);
    }

    const goal = await WishlistItem.findOne({ _id: id, userId: req.user._id });
    if (!goal) {
      const error = new Error("Goal not found");
      error.statusCode = 404;
      return next(error);
    }

    const numericAmount = Number(amount);
    const { availableSavingsBalance } = await getAvailableSavingsBalance(req.user._id);
    if (numericAmount > availableSavingsBalance) {
      const error = new Error(
        `You only have ${availableSavingsBalance.toFixed(2)} available in savings`
      );
      error.statusCode = 400;
      return next(error);
    }

    goal.savedAmount = Number(goal.savedAmount || 0) + numericAmount;
    if (Number(goal.savedAmount) >= Number(goal.targetAmount || 0)) {
      goal.status = "completed";
      goal.completedAt = new Date();
    }
    await goal.save();

    return res.status(200).json({ success: true, goal });
  } catch (err) {
    return next(err);
  }
};

const completeGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid goal id");
      error.statusCode = 400;
      return next(error);
    }

    const goal = await WishlistItem.findOne({ _id: id, userId: req.user._id });
    if (!goal) {
      const error = new Error("Goal not found");
      error.statusCode = 404;
      return next(error);
    }

    goal.status = "completed";
    goal.completedAt = new Date();
    await goal.save();

    return res.status(200).json({ success: true, goal });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createGoal,
  getGoals,
  updateGoal,
  deleteGoal,
  addSavings,
  completeGoal,
};
