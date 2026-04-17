const express = require("express");
const transactionController = require("../controllers/transactionController");
const { protect } = require("../middlewares/auth");

const router = express.Router();

router.use(protect);

router.get("/stats", transactionController.getStats);
router.post("/", transactionController.createTransaction);
router.get("/", transactionController.getTransactions);
router.get("/:id", transactionController.getTransactionById);
router.patch("/:id", transactionController.updateTransaction);
router.delete("/:id", transactionController.deleteTransaction);

module.exports = router;
