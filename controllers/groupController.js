const mongoose = require("mongoose");
const Group = require("../models/Group");
const GroupExpense = require("../models/GroupExpense");
const User = require("../models/User");
const { createNotification } = require("./notificationController");

const ensureValidObjectId = (id, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }
};

const ensureGroupMember = (group, userId) => {
  const isMember = group.members.some(
    (member) => String(member._id || member) === String(userId)
  );
  if (!isMember) {
    const error = new Error("Access denied: user is not a group member");
    error.statusCode = 403;
    throw error;
  }
};

const isGroupCreator = (group, userId) =>
  String(group.createdBy?._id || group.createdBy) === String(userId);

const formatAmount = (amount) => Number(amount || 0).toFixed(2);

const createGroup = async (req, res, next) => {
  try {
    const { name, members = [] } = req.body;
    if (!name) {
      const error = new Error("name is required");
      error.statusCode = 400;
      return next(error);
    }

    const uniqueMembers = [...new Set([...members.map(String), String(req.user._id)])];
    uniqueMembers.forEach((memberId) => ensureValidObjectId(memberId, "memberId"));

    const group = await Group.create({
      name,
      createdBy: req.user._id,
      members: uniqueMembers,
    });

    return res.status(201).json({ success: true, group });
  } catch (err) {
    return next(err);
  }
};

const getGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ members: String(req.user._id) })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: groups.length, groups });
  } catch (err) {
    return next(err);
  }
};

const getGroupById = async (req, res, next) => {
  try {
    const { id } = req.params;
    ensureValidObjectId(id, "group id");

    const group = await Group.findById(id)
      .populate("createdBy", "name email")
      .populate("members", "name email");
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }

    ensureGroupMember(group, req.user._id);
    return res.status(200).json({ success: true, group });
  } catch (err) {
    return next(err);
  }
};

const deleteGroup = async (req, res, next) => {
  try {
    const { id } = req.params;
    ensureValidObjectId(id, "group id");

    const group = await Group.findById(id);
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }

    ensureGroupMember(group, req.user._id);
    if (!isGroupCreator(group, req.user._id)) {
      const error = new Error("Only group creator can delete the group");
      error.statusCode = 403;
      return next(error);
    }

    await Promise.all([
      GroupExpense.deleteMany({ groupId: id }),
      Group.findByIdAndDelete(id),
    ]);

    return res.status(200).json({ success: true, message: "Group deleted successfully" });
  } catch (err) {
    return next(err);
  }
};

const addMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId, email } = req.body;
    ensureValidObjectId(id, "group id");

    const group = await Group.findById(id)
      .populate("createdBy", "name email")
      .populate("members", "name email");
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }

    ensureGroupMember(group, req.user._id);
    if (!isGroupCreator(group, req.user._id)) {
      const error = new Error("Only group creator can add members");
      error.statusCode = 403;
      return next(error);
    }

    let targetUserId = userId;
    if (!targetUserId && email) {
      const userByEmail = await User.findOne({ email: String(email).toLowerCase().trim() });
      if (!userByEmail) {
        const error = new Error("User with this email does not exist");
        error.statusCode = 404;
        return next(error);
      }
      targetUserId = String(userByEmail._id);
    }

    if (!targetUserId) {
      const error = new Error("userId or email is required");
      error.statusCode = 400;
      return next(error);
    }
    ensureValidObjectId(targetUserId, "userId");

    if (!group.members.some((member) => String(member._id || member) === String(targetUserId))) {
      group.members.push(targetUserId);
      await group.save();

      await createNotification(
        targetUserId,
        "group",
        "Added to Group",
        `You were added to "${group.name}" by ${req.user.name || "a group member"}.`,
        { groupId: id }
      );
    }

    const updatedGroup = await Group.findById(id)
      .populate("createdBy", "name email")
      .populate("members", "name email");
    return res.status(200).json({ success: true, group: updatedGroup });
  } catch (err) {
    return next(err);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    ensureValidObjectId(id, "group id");
    ensureValidObjectId(userId, "userId");

    const group = await Group.findById(id)
      .populate("createdBy", "name email")
      .populate("members", "name email");
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }

    ensureGroupMember(group, req.user._id);
    if (!isGroupCreator(group, req.user._id)) {
      const error = new Error("Only group creator can remove members");
      error.statusCode = 403;
      return next(error);
    }

    if (isGroupCreator(group, userId)) {
      const error = new Error("Group creator cannot be removed");
      error.statusCode = 400;
      return next(error);
    }

    group.members = group.members.filter((member) => String(member._id || member) !== String(userId));
    await group.save();
    const updatedGroup = await Group.findById(id)
      .populate("createdBy", "name email")
      .populate("members", "name email");
    return res.status(200).json({ success: true, group: updatedGroup });
  } catch (err) {
    return next(err);
  }
};

const addGroupExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    ensureValidObjectId(id, "group id");

    const group = await Group.findById(id);
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }
    ensureGroupMember(group, req.user._id);
    if (!isGroupCreator(group, req.user._id)) {
      const error = new Error("Only group creator can add shared expenses");
      error.statusCode = 403;
      return next(error);
    }

    const { amount, description, splitBetween = [], date, attachmentUrl } = req.body;
    if (!amount || !description || !Array.isArray(splitBetween) || splitBetween.length === 0) {
      const error = new Error("amount, description and splitBetween are required");
      error.statusCode = 400;
      return next(error);
    }

    splitBetween.forEach((entry) => {
      ensureValidObjectId(entry.userId, "splitBetween.userId");
      if (!group.members.some((memberId) => String(memberId) === String(entry.userId))) {
        const error = new Error("All split members must belong to the group");
        error.statusCode = 400;
        throw error;
      }
    });

    const expense = await GroupExpense.create({
      groupId: id,
      paidBy: req.user._id,
      amount,
      description,
      splitBetween,
      date,
      attachmentUrl,
    });

    // Create notifications for group members who need to pay
    const memberIds = splitBetween.map(entry => entry.userId);
    for (const memberId of memberIds) {
      if (String(memberId) !== String(req.user._id)) {
        await createNotification(
          memberId,
          "group",
          "New Group Expense",
          `A new expense "${description}" of INR ${formatAmount(amount)} was added to "${group.name}".`,
          { groupId: id, expenseId: expense._id }
        );
      }
    }

    return res.status(201).json({ success: true, expense });
  } catch (err) {
    return next(err);
  }
};

const getGroupExpenses = async (req, res, next) => {
  try {
    const { id } = req.params;
    ensureValidObjectId(id, "group id");

    const group = await Group.findById(id);
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }
    ensureGroupMember(group, req.user._id);

    const expenses = await GroupExpense.find({ groupId: id })
      .populate("paidBy", "name email")
      .populate("splitBetween.userId", "name email")
      .sort({ date: -1 });
    return res.status(200).json({ success: true, count: expenses.length, expenses });
  } catch (err) {
    return next(err);
  }
};

const settleExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    const userId = req.body.userId || String(req.user._id);
    ensureValidObjectId(expenseId, "expense id");
    ensureValidObjectId(userId, "userId");

    const expense = await GroupExpense.findById(expenseId);
    if (!expense) {
      const error = new Error("Group expense not found");
      error.statusCode = 404;
      return next(error);
    }

    const group = await Group.findById(expense.groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }
    ensureGroupMember(group, req.user._id);

    const splitEntry = expense.splitBetween.find(
      (entry) => String(entry.userId) === String(userId)
    );
    if (!splitEntry) {
      const error = new Error("User is not part of splitBetween");
      error.statusCode = 400;
      return next(error);
    }

    splitEntry.settled = true;
    await expense.save();

    // Notify the person who paid the expense
    if (String(expense.paidBy) !== String(userId)) {
      const settler = await User.findById(userId).select("name");
      await createNotification(
        expense.paidBy,
        "group",
        "Expense Settled",
        `${settler?.name || "Someone"} settled their share of "${expense.description}" in "${group.name}" group`,
        { groupId: expense.groupId, expenseId: expense._id }
      );
    }

    return res.status(200).json({ success: true, expense });
  } catch (err) {
    return next(err);
  }
};

const updateGroupExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    ensureValidObjectId(expenseId, "expense id");

    const expense = await GroupExpense.findById(expenseId);
    if (!expense) {
      const error = new Error("Group expense not found");
      error.statusCode = 404;
      return next(error);
    }

    const group = await Group.findById(expense.groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }
    ensureGroupMember(group, req.user._id);

    // Only group creator can update expenses
    if (!isGroupCreator(group, req.user._id)) {
      const error = new Error("Only group creator can update expenses");
      error.statusCode = 403;
      return next(error);
    }

    const { amount, description, splitBetween = [], date, attachmentUrl } = req.body;
    if (!amount || !description || !Array.isArray(splitBetween) || splitBetween.length === 0) {
      const error = new Error("amount, description and splitBetween are required");
      error.statusCode = 400;
      return next(error);
    }

    splitBetween.forEach((entry) => {
      ensureValidObjectId(entry.userId, "splitBetween.userId");
      if (!group.members.some((memberId) => String(memberId) === String(entry.userId))) {
        const error = new Error("All split members must belong to the group");
        error.statusCode = 400;
        throw error;
      }
    });

    expense.amount = amount;
    expense.description = description;
    expense.splitBetween = splitBetween;
    if (date) expense.date = date;
    if (attachmentUrl !== undefined) expense.attachmentUrl = attachmentUrl;

    await expense.save();

    const notifiedUserIds = new Set();
    for (const split of splitBetween) {
      const participantId = String(split.userId);
      if (participantId === String(req.user._id) || notifiedUserIds.has(participantId)) {
        continue;
      }

      notifiedUserIds.add(participantId);
      await createNotification(
        participantId,
        "group",
        "Group Expense Updated",
        `The expense "${description}" in "${group.name}" was updated to INR ${formatAmount(amount)}.`,
        { groupId: expense.groupId, expenseId: expense._id }
      );
    }

    const updatedExpense = await GroupExpense.findById(expenseId)
      .populate("paidBy", "name email")
      .populate("splitBetween.userId", "name email");

    return res.status(200).json({ success: true, expense: updatedExpense });
  } catch (err) {
    return next(err);
  }
};

const deleteGroupExpense = async (req, res, next) => {
  try {
    const { expenseId } = req.params;
    ensureValidObjectId(expenseId, "expense id");

    const expense = await GroupExpense.findById(expenseId);
    if (!expense) {
      const error = new Error("Group expense not found");
      error.statusCode = 404;
      return next(error);
    }

    const group = await Group.findById(expense.groupId);
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }
    ensureGroupMember(group, req.user._id);

    // Only group creator can delete expenses
    if (!isGroupCreator(group, req.user._id)) {
      const error = new Error("Only group creator can delete expenses");
      error.statusCode = 403;
      return next(error);
    }

    await GroupExpense.findByIdAndDelete(expenseId);
    return res.status(200).json({ success: true, message: "Expense deleted successfully" });
  } catch (err) {
    return next(err);
  }
};

const getBalanceSheet = async (req, res, next) => {
  try {
    const { id } = req.params;
    ensureValidObjectId(id, "group id");

    const group = await Group.findById(id);
    if (!group) {
      const error = new Error("Group not found");
      error.statusCode = 404;
      return next(error);
    }
    ensureGroupMember(group, req.user._id);

    const expenses = await GroupExpense.find({ groupId: id });
    const netByUser = group.members.reduce((acc, memberId) => {
      acc[String(memberId)] = 0;
      return acc;
    }, {});

    expenses.forEach((expense) => {
      const payerId = String(expense.paidBy);
      expense.splitBetween.forEach((split) => {
        if (split.settled || String(split.userId) === payerId) {
          return;
        }
        const debtorId = String(split.userId);
        netByUser[debtorId] = (netByUser[debtorId] || 0) - split.share;
        netByUser[payerId] = (netByUser[payerId] || 0) + split.share;
      });
    });

    const creditors = [];
    const debtors = [];
    Object.entries(netByUser).forEach(([userId, amount]) => {
      if (amount > 0.0001) creditors.push({ userId, amount });
      if (amount < -0.0001) debtors.push({ userId, amount: Math.abs(amount) });
    });

    const settlements = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const settleAmount = Math.min(debtors[i].amount, creditors[j].amount);
      settlements.push({
        from: debtors[i].userId,
        to: creditors[j].userId,
        amount: Number(settleAmount.toFixed(2)),
      });
      debtors[i].amount -= settleAmount;
      creditors[j].amount -= settleAmount;
      if (debtors[i].amount <= 0.0001) i += 1;
      if (creditors[j].amount <= 0.0001) j += 1;
    }

    return res.status(200).json({
      success: true,
      netByUser,
      settlements,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createGroup,
  getGroups,
  getGroupById,
  deleteGroup,
  addMember,
  removeMember,
  addGroupExpense,
  getGroupExpenses,
  updateGroupExpense,
  deleteGroupExpense,
  settleExpense,
  getBalanceSheet,
};
