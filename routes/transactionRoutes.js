const express = require("express");
const transactionController = require("../controllers/transactionController");
const { protect } = require("../middlewares/auth");
const {
  uploadSingleAttachment,
  uploadAttachmentToCloudinary,
} = require("../middlewares/uploadMiddleware");

const router = express.Router();

router.use(protect);

router.get("/stats", transactionController.getStats);

// Parse the multipart form, upload to Cloudinary (optional), then create
router.post(
  "/",
  (req, res, next) => {
    console.log("➡️ Hit route");
    next();
  },
  uploadSingleAttachment,
  (req, res, next) => {
    next();
  },
  uploadAttachmentToCloudinary,
  transactionController.createTransaction
);

router.get("/", transactionController.getTransactions);
router.get("/:id", transactionController.getTransactionById);

// Allow attachment replacement on updates too
router.patch(
  "/:id",
  uploadSingleAttachment,
  uploadAttachmentToCloudinary,
  transactionController.updateTransaction
);

router.delete("/:id", transactionController.deleteTransaction);

module.exports = router;