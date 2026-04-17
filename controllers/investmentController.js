const mongoose = require("mongoose");
const Investment = require("../models/Investment");
const Transaction = require("../models/Transaction");
const WishlistItem = require("../models/WishlistItem");

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const parseEntryAmount = (entry) =>
  Number(entry.amount ?? entry.investedAmount ?? 0);

const getMonthRange = (inputDate = new Date()) => {
  const date = new Date(inputDate);
  if (Number.isNaN(date.getTime())) {
    const error = new Error("Invalid savings date");
    error.statusCode = 400;
    throw error;
  }

  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
};

const calculateMonthlyNet = async (userId, inputDate) => {
  const { start, end } = getMonthRange(inputDate);
  const transactionStats = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        date: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: null,
        income: {
          $sum: {
            $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
          },
        },
        expense: {
          $sum: {
            $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        income: 1,
        expense: 1,
        net: { $subtract: ["$income", "$expense"] },
      },
    },
  ]);

  const totals = transactionStats[0] || { income: 0, expense: 0, net: 0 };
  return {
    start,
    end,
    totalIncome: Number(totals.income || 0),
    totalExpense: Number(totals.expense || 0),
    netAmount: Number(totals.net || 0),
  };
};

const calculateSavingsBalance = async (userId, excludedEntryId = null) => {
  const filter = { userId };
  if (excludedEntryId) {
    filter._id = { $ne: excludedEntryId };
  }

  const entries = await Investment.find(filter).select("entryType amount investedAmount");
  return entries.reduce((total, entry) => {
    const amount = parseEntryAmount(entry);
    return entry.entryType === "withdrawal" ? total - amount : total + amount;
  }, 0);
};

const calculateLockedGoalSavings = async (userId) => {
  const lockedGoalSavings = await WishlistItem.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
    {
      $group: {
        _id: null,
        totalLocked: { $sum: "$savedAmount" },
      },
    },
  ]);

  return Number(lockedGoalSavings[0]?.totalLocked || 0);
};

const calculateMonthlySavingsActivity = async (userId, inputDate, excludedEntryId = null) => {
  const { start, end } = getMonthRange(inputDate);
  const filter = { userId, date: { $gte: start, $lt: end } };
  if (excludedEntryId) {
    filter._id = { $ne: excludedEntryId };
  }

  const entries = await Investment.find(filter).select("entryType amount investedAmount");
  const totals = entries.reduce(
    (acc, entry) => {
      const amount = parseEntryAmount(entry);
      if (entry.entryType === "withdrawal") {
        acc.usedAmount += amount;
      } else {
        acc.savedAmount += amount;
      }
      return acc;
    },
    { savedAmount: 0, usedAmount: 0 }
  );

  return {
    start,
    end,
    savedAmount: totals.savedAmount,
    usedAmount: totals.usedAmount,
  };
};

const validateSavingsEntry = async ({
  userId,
  entryType,
  amount,
  date,
  excludedEntryId = null,
}) => {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    const error = new Error("amount must be greater than 0");
    error.statusCode = 400;
    throw error;
  }

  if (entryType === "withdrawal") {
    const totalSavingsBalance = await calculateSavingsBalance(userId, excludedEntryId);
    const lockedGoalSavings = await calculateLockedGoalSavings(userId);
    const availableSavings = Math.max(0, totalSavingsBalance - lockedGoalSavings);
    if (normalizedAmount > availableSavings) {
      const error = new Error(
        `You only have ${availableSavings.toFixed(2)} available in savings`
      );
      error.statusCode = 400;
      throw error;
    }

    return {
      totalSavingsBalance,
      lockedGoalSavings,
      availableSavings,
      warning:
        "This will use money from your saved balance instead of this month's remaining net amount.",
    };
  }

  const monthlyNet = await calculateMonthlyNet(userId, date || new Date());
  const monthlySavings = await calculateMonthlySavingsActivity(
    userId,
    date || new Date(),
    excludedEntryId
  );
  const remainingAmount = Math.max(0, monthlyNet.netAmount - monthlySavings.savedAmount);

  if (normalizedAmount > remainingAmount) {
    const error = new Error(
      `You can only save ${remainingAmount.toFixed(2)} from this month's remaining net amount`
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    ...monthlyNet,
    ...monthlySavings,
    remainingAmount,
  };
};

const normalizePayload = (body, existingEntry = null) => {
  const entryType = body.entryType || existingEntry?.entryType || "deposit";
  const amount =
    body.amount !== undefined
      ? Number(body.amount)
      : body.investedAmount !== undefined
        ? Number(body.investedAmount)
        : parseEntryAmount(existingEntry);

  return {
    entryType,
    type: body.type || existingEntry?.type || "other",
    name: body.name || existingEntry?.name,
    amount,
    investedAmount: amount,
    currentValue: amount,
    durationMonths:
      body.durationMonths !== undefined
        ? Number(body.durationMonths)
        : existingEntry?.durationMonths || 1,
    date: body.date || existingEntry?.date || new Date(),
    notes: body.notes !== undefined ? body.notes : existingEntry?.notes || "",
  };
};

const addInvestment = async (req, res, next) => {
  try {
    const payload = normalizePayload(req.body);
    if (!payload.name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }

    await validateSavingsEntry({
      userId: req.user._id,
      entryType: payload.entryType,
      amount: payload.amount,
      date: payload.date,
    });

    const investment = await Investment.create({
      userId: req.user._id,
      ...payload,
    });

    return res.status(201).json({ success: true, investment });
  } catch (err) {
    return next(err);
  }
};

const getInvestments = async (req, res, next) => {
  try {
    const filter = { userId: req.user._id };
    if (req.query.entryType) {
      filter.entryType = req.query.entryType;
    }

    const { page, limit, skip } = parsePagination(req.query);
    const [investments, total] = await Promise.all([
      Investment.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
      Investment.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: investments.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      investments,
    });
  } catch (err) {
    return next(err);
  }
};

const updateInvestment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid savings entry id");
      error.statusCode = 400;
      return next(error);
    }

    const existingInvestment = await Investment.findOne({ _id: id, userId: req.user._id });
    if (!existingInvestment) {
      const error = new Error("Savings entry not found");
      error.statusCode = 404;
      return next(error);
    }

    const payload = normalizePayload(req.body, existingInvestment);
    if (!payload.name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }

    await validateSavingsEntry({
      userId: req.user._id,
      entryType: payload.entryType,
      amount: payload.amount,
      date: payload.date,
      excludedEntryId: existingInvestment._id,
    });

    const investment = await Investment.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      payload,
      { new: true, runValidators: true }
    );

    return res.status(200).json({ success: true, investment });
  } catch (err) {
    return next(err);
  }
};

const deleteInvestment = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid savings entry id");
      error.statusCode = 400;
      return next(error);
    }

    const deleted = await Investment.findOne({ _id: id, userId: req.user._id });
    if (!deleted) {
      const error = new Error("Savings entry not found");
      error.statusCode = 404;
      return next(error);
    }

    if (deleted.entryType !== "withdrawal") {
      const resultingBalance = await calculateSavingsBalance(req.user._id, deleted._id);
      if (resultingBalance < 0) {
        const error = new Error("Cannot delete this savings entry because it is already being used");
        error.statusCode = 400;
        return next(error);
      }
    }

    await Investment.deleteOne({ _id: id, userId: req.user._id });
    return res.status(200).json({ success: true, message: "Savings entry deleted successfully" });
  } catch (err) {
    return next(err);
  }
};

const getInvestmentSummary = async (req, res, next) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(String(req.user._id));
    const currentMonthNet = await calculateMonthlyNet(req.user._id, new Date());
    const currentMonthSavings = await calculateMonthlySavingsActivity(req.user._id, new Date());
    const lockedGoalSavings = await calculateLockedGoalSavings(req.user._id);
    const summaryData = await Investment.aggregate([
      { $match: { userId: userObjectId } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalSaved: {
                  $sum: {
                    $cond: [
                      { $eq: ["$entryType", "withdrawal"] },
                      0,
                      { $ifNull: ["$amount", "$investedAmount"] },
                    ],
                  },
                },
                totalUsed: {
                  $sum: {
                    $cond: [
                      { $eq: ["$entryType", "withdrawal"] },
                      { $ifNull: ["$amount", "$investedAmount"] },
                      0,
                    ],
                  },
                },
                entryCount: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                totalSaved: 1,
                totalUsed: 1,
                entryCount: 1,
                currentBalance: { $subtract: ["$totalSaved", "$totalUsed"] },
              },
            },
          ],
          monthlyActivity: [
            {
              $group: {
                _id: {
                  year: { $year: "$date" },
                  month: { $month: "$date" },
                },
                saved: {
                  $sum: {
                    $cond: [
                      { $eq: ["$entryType", "withdrawal"] },
                      0,
                      { $ifNull: ["$amount", "$investedAmount"] },
                    ],
                  },
                },
                used: {
                  $sum: {
                    $cond: [
                      { $eq: ["$entryType", "withdrawal"] },
                      { $ifNull: ["$amount", "$investedAmount"] },
                      0,
                    ],
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                year: "$_id.year",
                month: "$_id.month",
                label: {
                  $concat: [
                    { $toString: "$_id.month" },
                    "/",
                    { $toString: "$_id.year" },
                  ],
                },
                saved: 1,
                used: 1,
                net: { $subtract: ["$saved", "$used"] },
              },
            },
            { $sort: { year: 1, month: 1 } },
          ],
        },
      },
    ]);

    const data = summaryData[0] || {};
    const totals = data.totals?.[0] || {
      totalSaved: 0,
      totalUsed: 0,
      entryCount: 0,
      currentBalance: 0,
    };
    const availableBalance = Math.max(
      0,
      Number(totals.currentBalance || 0) - Number(lockedGoalSavings || 0)
    );
    const remainingAmount = Math.max(
      0,
      Number(currentMonthNet.netAmount || 0) - Number(currentMonthSavings.savedAmount || 0)
    );
    const shouldWarnSavingsUse =
      Number(currentMonthNet.netAmount || 0) <= 0 || remainingAmount <= 0;

    return res.status(200).json({
      success: true,
      totals,
      lockedGoalSavings,
      availableBalance,
      byType: [],
      monthlyActivity: data.monthlyActivity || [],
      currentMonth: {
        totalIncome: currentMonthNet.totalIncome,
        totalExpense: currentMonthNet.totalExpense,
        netAmount: currentMonthNet.netAmount,
        savedAmount: currentMonthSavings.savedAmount,
        usedAmount: currentMonthSavings.usedAmount,
        remainingAmount,
        monthLabel: currentMonthNet.start.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
        shouldWarnSavingsUse,
        warningMessage: shouldWarnSavingsUse
          ? "This month's net amount is exhausted. Using savings will reduce your saved balance."
          : "",
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  addInvestment,
  getInvestments,
  updateInvestment,
  deleteInvestment,
  getInvestmentSummary,
};
