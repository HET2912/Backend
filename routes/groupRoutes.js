const express = require("express");
const groupController = require("../controllers/groupController");
const { protect } = require("../middlewares/auth");

const router = express.Router();

router.use(protect);

router.post("/", groupController.createGroup);
router.get("/", groupController.getGroups);
router.get("/:id", groupController.getGroupById);
router.delete("/:id", groupController.deleteGroup);
router.post("/:id/members", groupController.addMember);
router.delete("/:id/members", groupController.removeMember);
router.post("/:id/expenses", groupController.addGroupExpense);
router.get("/:id/expenses", groupController.getGroupExpenses);
router.patch("/expenses/:expenseId", groupController.updateGroupExpense);
router.delete("/expenses/:expenseId", groupController.deleteGroupExpense);
router.patch("/expenses/:expenseId/settle", groupController.settleExpense);
router.get("/:id/balance-sheet", groupController.getBalanceSheet);

module.exports = router;
