const Category = require("../models/Category");

const defaultCategories = [
  // Income Categories
  { name: "Salary", icon: "Briefcase", color: "#10B981", type: "income" },
  { name: "Business Income", icon: "TrendingUp", color: "#22D3EE", type: "income" },
  { name: "Freelance", icon: "Briefcase", color: "#8B5CF6", type: "income" },
  { name: "Investment Returns", icon: "TrendingUp", color: "#F59E0B", type: "income" },
  { name: "Rental Income", icon: "Home", color: "#06B6D4", type: "income" },
  { name: "Bonus", icon: "TrendingUp", color: "#84CC16", type: "income" },
  { name: "Side Hustle", icon: "Briefcase", color: "#A855F7", type: "income" },
  { name: "Gifts", icon: "Heart", color: "#F43F5E", type: "income" },

  // Expense Categories
  { name: "Rent/Mortgage", icon: "Home", color: "#EF4444", type: "expense" },
  { name: "Food & Dining", icon: "Coffee", color: "#F97316", type: "expense" },
  { name: "Transportation", icon: "Car", color: "#06B6D4", type: "expense" },
  { name: "Shopping", icon: "ShoppingBag", color: "#7C3AED", type: "expense" },
  { name: "Bills & Utilities", icon: "Zap", color: "#EC4899", type: "expense" },
  { name: "Healthcare", icon: "Heart", color: "#F43F5E", type: "expense" },
  { name: "Education", icon: "Briefcase", color: "#8B5CF6", type: "expense" },
  { name: "Entertainment", icon: "Film", color: "#A855F7", type: "expense" },
  { name: "Travel", icon: "Plane", color: "#84CC16", type: "expense" },
  { name: "Insurance", icon: "Heart", color: "#F59E0B", type: "expense" },
  { name: "Personal Care", icon: "Heart", color: "#22D3EE", type: "expense" },
  { name: "Subscriptions", icon: "Zap", color: "#10B981", type: "expense" },
  { name: "Savings", icon: "TrendingUp", color: "#7C3AED", type: "expense" },
  { name: "Miscellaneous", icon: "ShoppingBag", color: "#F97316", type: "expense" },
];

const getCategories = async (req, res, next) => {
  try {
    const incomeLikeNames = [
      "Salary", "Business Income", "Freelance", "Investment Returns",
      "Rental Income", "Bonus", "Side Hustle", "Gifts", "Deposit"
    ];

    // Backfill older records created before `type` existed.
    await Category.updateMany(
      {
        userId: req.user._id,
        $or: [{ type: { $exists: false } }, { type: null }, { type: "" }],
      },
      { $set: { type: "expense" } }
    );

    // Correct known income category names that may have been backfilled as expense.
    await Category.updateMany(
      { userId: req.user._id, name: { $in: incomeLikeNames } },
      { $set: { type: "income" } }
    );

    let categories = await Category.find({ userId: req.user._id });

    // Always ensure all default categories exist for the user
    const existingNames = new Set(categories.map((cat) => cat.name.toLowerCase()));
    const missingDefaults = defaultCategories.filter(
      (cat) => !existingNames.has(cat.name.toLowerCase())
    );

    if (missingDefaults.length > 0) {
      const seeded = missingDefaults.map((cat) => ({
        ...cat,
        userId: req.user._id,
        isDefault: true
      }));
      await Category.insertMany(seeded, { ordered: false });
      categories = await Category.find({ userId: req.user._id });
    }

    // Get transaction counts for each category
    const Transaction = require("../models/Transaction");
    const categoryIds = categories.map(cat => cat._id.toString());
    const transactionCounts = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          categoryId: { $in: categoryIds }
        }
      },
      {
        $group: {
          _id: "$categoryId",
          count: { $sum: 1 }
        }
      }
    ]);

    // Create a map of categoryId to transaction count
    const countMap = new Map();
    transactionCounts.forEach(item => {
      countMap.set(item._id, item.count);
    });

    // Add transaction count to each category
    const categoriesWithCounts = categories.map(cat => ({
      ...cat.toObject(),
      transactions: countMap.get(cat._id.toString()) || 0
    }));

    return res.status(200).json({ success: true, count: categoriesWithCounts.length, categories: categoriesWithCounts });
  } catch (err) {
    return next(err);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const { name, icon, color, type } = req.body;
    if (!name || !type) {
      const error = new Error("name and type are required");
      error.statusCode = 400;
      return next(error);
    }

    const category = await Category.create({
      userId: req.user._id,
      name,
      icon,
      color,
      type,
    });

    return res.status(201).json({ success: true, category });
  } catch (err) {
    return next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = {};
    ["name", "icon", "color", "type"].forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const category = await Category.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!category) {
      const error = new Error("Category not found");
      error.statusCode = 400;
      return next(error);
    }

    return res.status(200).json({ success: true, category });
  } catch (err) {
    return next(err);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await Category.findOneAndDelete({ _id: id, userId: req.user._id });

    if (!deleted) {
      const error = new Error("Category not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
