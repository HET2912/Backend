const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const notificationController = require("../controllers/notificationController");

const router = express.Router();

router.get("/unread-count", protect, notificationController.getUnreadCount);
router.get("/", protect, notificationController.getNotifications);
router.patch("/:notificationId/read", protect, notificationController.markAsRead);
router.patch("/read-all", protect, (req, res, next) => {
    req.params.notificationId = "all";
    notificationController.markAsRead(req, res, next);
});
router.delete("/:notificationId", protect, notificationController.deleteNotification);

module.exports = router;
