const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const buildTransactionFilter = (userId, query) => {
  const filter = { userId };

  if (query.type) {
    filter.type = query.type;
  }

  if (query.category) {
    filter.categoryId = query.category;
  }

  if (query.startDate || query.endDate) {
    filter.date = {};
    if (query.startDate) {
      const start = new Date(query.startDate);
      if (Number.isNaN(start.getTime())) {
        const error = new Error("Invalid startDate");
        error.statusCode = 400;
        throw error;
      }
      filter.date.$gte = start;
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      if (Number.isNaN(end.getTime())) {
        const error = new Error("Invalid endDate");
        error.statusCode = 400;
        throw error;
      }
      filter.date.$lte = end;
    }
  }

  return filter;
};

const createTransaction = async (req, res, next) => {
  try {
    const { amount, type, categoryId, date, notes, attachmentUrl } = req.body;

    if (!amount || !type || !categoryId) {
      const error = new Error("amount, type, and categoryId are required");
      error.statusCode = 400;
      return next(error);
    }

    const transaction = await Transaction.create({
      userId: req.user._id,
      amount,
      type,
      categoryId,
      date,
      notes,
      attachmentUrl,
    });

    return res.status(201).json({ success: true, transaction });
  } catch (err) {
    return next(err);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const filter = buildTransactionFilter(req.user._id, req.query);
    const { page, limit, skip } = parsePagination(req.query);

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: transactions.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      transactions,
    });
  } catch (err) {
    return next(err);
  }
};

const getTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid transaction id");
      error.statusCode = 400;
      return next(error);
    }

    const transaction = await Transaction.findOne({ _id: id, userId: req.user._id });
    if (!transaction) {
      const error = new Error("Transaction not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({ success: true, transaction });
  } catch (err) {
    return next(err);
  }
};

const updateTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid transaction id");
      error.statusCode = 400;
      return next(error);
    }

    const updates = {};
    ["amount", "type", "categoryId", "date", "notes", "attachmentUrl"].forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const transaction = await Transaction.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!transaction) {
      const error = new Error("Transaction not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({ success: true, transaction });
  } catch (err) {
    return next(err);
  }
};

const deleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error("Invalid transaction id");
      error.statusCode = 400;
      return next(error);
    }

    const deleted = await Transaction.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!deleted) {
      const error = new Error("Transaction not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({ success: true, message: "Transaction deleted successfully" });
  } catch (err) {
    return next(err);
  }
};

const getStats = async (req, res, next) => {
  try {
    const filter = buildTransactionFilter(req.user._id, req.query);
    const userObjectId = new mongoose.Types.ObjectId(String(req.user._id));

    const stats = await Transaction.aggregate([
      {
        $match: {
          ...filter,
          userId: userObjectId,
        },
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalIncome: {
                  $sum: {
                    $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                  },
                },
                totalExpense: {
                  $sum: {
                    $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                  },
                },
                transactionCount: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                totalIncome: 1,
                totalExpense: 1,
                transactionCount: 1,
                net: { $subtract: ["$totalIncome", "$totalExpense"] },
              },
            },
          ],
          categoryBreakdown: [
            {
              $group: {
                _id: "$categoryId",
                totalAmount: { $sum: "$amount" },
                incomeAmount: {
                  $sum: {
                    $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                  },
                },
                expenseAmount: {
                  $sum: {
                    $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                  },
                },
                count: { $sum: 1 },
              },
            },
            {
              $lookup: {
                from: "categories",
                let: { categoryId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: [{ $toString: "$_id" }, "$$categoryId"],
                      },
                    },
                  },
                ],
                as: "category",
              },
            },
            {
              $project: {
                _id: 0,
                categoryId: "$_id",
                categoryName: {
                  $ifNull: [{ $arrayElemAt: ["$category.name", 0] }, "Uncategorized"],
                },
                totalAmount: 1,
                incomeAmount: 1,
                expenseAmount: 1,
                count: 1,
              },
            },
            { $sort: { totalAmount: -1 } },
          ],
          monthlyTrends: [
            {
              $group: {
                _id: {
                  year: { $year: "$date" },
                  month: { $month: "$date" },
                },
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
                year: "$_id.year",
                month: "$_id.month",
                income: 1,
                expense: 1,
                net: { $subtract: ["$income", "$expense"] },
              },
            },
            { $sort: { year: 1, month: 1 } },
          ],
        },
      },
    ]);

    const data = stats[0] || {};
    return res.status(200).json({
      success: true,
      totals: data.totals?.[0] || {
        totalIncome: 0,
        totalExpense: 0,
        transactionCount: 0,
        net: 0,
      },
      categoryBreakdown: data.categoryBreakdown || [],
      monthlyTrends: data.monthlyTrends || [],
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getStats,
};
