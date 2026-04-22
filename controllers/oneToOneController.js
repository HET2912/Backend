const mongoose = require("mongoose");
const OneToOne = require("../models/OneToOne");

const normalizeName = (name) => String(name || "").trim().toLowerCase();

const sumEntries = (entries) =>
  (Array.isArray(entries) ? entries : []).reduce(
    (acc, e) => acc + (Number(e?.value) || 0),
    0
  );

const toSignedValue = ({ owe, amount }) => {
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    const error = new Error("amount must be a number > 0");
    error.statusCode = 400;
    throw error;
  }
  if (typeof owe !== "boolean") {
    const error = new Error("owe must be a boolean");
    error.statusCode = 400;
    throw error;
  }
  return owe ? Math.abs(parsedAmount) : -Math.abs(parsedAmount);
};

// POST /api/one-to-one-split
// Body: { name, reason, owe, amount, date }
// Behavior: one document per friend (grouped by name); pushes signed amount into `amount[]`
const addSplit = async (req, res, next) => {
  try {
    const name = normalizeName(req.body.name);
    const reason = req.body.reason ?? "";
    const owe = req.body.owe;
    const rawAmount = req.body.amount;
    const date = req.body.date ? new Date(req.body.date) : new Date();

    if (!name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }
    const signed = toSignedValue({ owe, amount: rawAmount });
    if (Number.isNaN(date.getTime())) {
      const error = new Error("Invalid date");
      error.statusCode = 400;
      return next(error);
    }

    const doc = await OneToOne.findOneAndUpdate(
      { userId: req.user._id, name },
      {
        $push: {
          amount: {
            value: signed,
            reason: String(reason || ""),
            owe,
            date,
          },
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const net = sumEntries(doc.amount);
    return res.status(201).json({
      success: true,
      split: doc,
      net,
      settlement:
        net > 0
          ? { youOwe: net, theyOwe: 0 }
          : net < 0
            ? { youOwe: 0, theyOwe: Math.abs(net) }
            : { youOwe: 0, theyOwe: 0 },
    });
  } catch (err) {
    // Handle unique index races (same userId+name)
    if (err && err.code === 11000) {
      err.statusCode = 409;
      err.message = "A split record for this name already exists. Retry your request.";
    }
    return next(err);
  }
};

// GET /api/one-to-one-split
// Returns per-friend grouped list with net settlement
const listSplits = async (req, res, next) => {
  try {
    const docs = await OneToOne.find({ userId: req.user._id }).sort({ name: 1 });
    const splits = docs.map((d) => {
      const net = sumEntries(d.amount);
      return {
        _id: d._id,
        name: d.name,
        amount: d.amount,
        net,
        settlement:
          net > 0
            ? { youOwe: net, theyOwe: 0 }
            : net < 0
              ? { youOwe: 0, theyOwe: Math.abs(net) }
              : { youOwe: 0, theyOwe: 0 },
      };
    });

    return res.status(200).json({ success: true, count: splits.length, splits });
  } catch (err) {
    return next(err);
  }
};

// GET /api/one-to-one-split/:name
const getSplitByName = async (req, res, next) => {
  try {
    const name = normalizeName(req.params.name);
    if (!name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }

    const split = await OneToOne.findOne({ userId: req.user._id, name });
    if (!split) {
      const error = new Error("Split record not found");
      error.statusCode = 404;
      return next(error);
    }

    const net = sumEntries(split.amount);
    return res.status(200).json({
      success: true,
      split,
      net,
      settlement:
        net > 0
          ? { youOwe: net, theyOwe: 0 }
          : net < 0
            ? { youOwe: 0, theyOwe: Math.abs(net) }
            : { youOwe: 0, theyOwe: 0 },
    });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/one-to-one-split/:name
const deleteSplitByName = async (req, res, next) => {
  try {
    const name = normalizeName(req.params.name);
    if (!name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }

    const deleted = await OneToOne.findOneAndDelete({ userId: req.user._id, name });
    if (!deleted) {
      const error = new Error("Split record not found");
      error.statusCode = 404;
      return next(error);
    }
    return res.status(200).json({ success: true, message: "Split record deleted" });
  } catch (err) {
    return next(err);
  }
};

// POST /api/one-to-one-split/:name/settle
// Clears amounts (marks as settled)
const settleByName = async (req, res, next) => {
  try {
    const name = normalizeName(req.params.name);
    if (!name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }

    const split = await OneToOne.findOneAndUpdate(
      { userId: req.user._id, name },
      { $set: { amount: [] } },
      { new: true, runValidators: true }
    );

    if (!split) {
      const error = new Error("Split record not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({
      success: true,
      message: "Settled (cleared amounts)",
      split,
      net: 0,
      settlement: { youOwe: 0, theyOwe: 0 },
    });
  } catch (err) {
    return next(err);
  }
};

// PATCH /api/one-to-one-split/:name/entries/:entryId
// Body: { amount, owe, reason, date }
const updateEntry = async (req, res, next) => {
  try {
    const name = normalizeName(req.params.name);
    const { entryId } = req.params;
    if (!name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      const error = new Error("Invalid entry id");
      error.statusCode = 400;
      return next(error);
    }

    const split = await OneToOne.findOne({ userId: req.user._id, name });
    if (!split) {
      const error = new Error("Split record not found");
      error.statusCode = 404;
      return next(error);
    }

    const entry = split.amount.id(entryId);
    if (!entry) {
      const error = new Error("Entry not found");
      error.statusCode = 404;
      return next(error);
    }

    // allow partial updates
    if (req.body.owe !== undefined || req.body.amount !== undefined) {
      const owe = req.body.owe !== undefined ? req.body.owe : entry.owe;
      const amount = req.body.amount !== undefined ? req.body.amount : Math.abs(entry.value);
      const signed = toSignedValue({ owe, amount });
      entry.value = signed;
      entry.owe = owe;
    }
    if (req.body.reason !== undefined) entry.reason = String(req.body.reason || "");
    if (req.body.date !== undefined) {
      const date = new Date(req.body.date);
      if (Number.isNaN(date.getTime())) {
        const error = new Error("Invalid date");
        error.statusCode = 400;
        return next(error);
      }
      entry.date = date;
    }

    await split.save();

    const net = sumEntries(split.amount);
    return res.status(200).json({
      success: true,
      split,
      net,
      settlement:
        net > 0
          ? { youOwe: net, theyOwe: 0 }
          : net < 0
            ? { youOwe: 0, theyOwe: Math.abs(net) }
            : { youOwe: 0, theyOwe: 0 },
    });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/one-to-one-split/:name/entries/:entryId
const deleteEntry = async (req, res, next) => {
  try {
    const name = normalizeName(req.params.name);
    const { entryId } = req.params;
    if (!name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      const error = new Error("Invalid entry id");
      error.statusCode = 400;
      return next(error);
    }

    const split = await OneToOne.findOne({ userId: req.user._id, name });
    if (!split) {
      const error = new Error("Split record not found");
      error.statusCode = 404;
      return next(error);
    }

    const entry = split.amount.id(entryId);
    if (!entry) {
      const error = new Error("Entry not found");
      error.statusCode = 404;
      return next(error);
    }

    entry.deleteOne();
    await split.save();

    const net = sumEntries(split.amount);
    return res.status(200).json({
      success: true,
      split,
      net,
      settlement:
        net > 0
          ? { youOwe: net, theyOwe: 0 }
          : net < 0
            ? { youOwe: 0, theyOwe: Math.abs(net) }
            : { youOwe: 0, theyOwe: 0 },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  addSplit,
  listSplits,
  getSplitByName,
  deleteSplitByName,
  settleByName,
  updateEntry,
  deleteEntry,
};

