const express = require("express");
const healthController = require("../controllers/healthController");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const transactionRoutes = require("./transactionRoutes");
const investmentRoutes = require("./investmentRoutes");
const groupRoutes = require("./groupRoutes");
const aiRoutes = require("./aiRoutes");
const wishlistRoutes = require("./wishlistRoutes");
const categoryRoutes = require("./categoryRoutes");
const chatRoutes = require("./chatRoutes");
const notificationRoutes = require("./notificationRoutes");
const oneToOneRoutes = require("./oneToOneRoutes");

const router = express.Router();

router.get("/health", healthController.getHealth);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/transactions", transactionRoutes);
router.use("/investments", investmentRoutes);
router.use("/groups", groupRoutes);
router.use("/messages", chatRoutes);
router.use("/notifications", notificationRoutes);
router.use("/ai", aiRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/categories", categoryRoutes);
router.use("/one-to-one-split", oneToOneRoutes);

module.exports = router;
