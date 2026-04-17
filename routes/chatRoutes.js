const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const chatController = require("../controllers/chatController");

const router = express.Router();

router.get("/users", protect, chatController.getChatUsers);
router.get("/conversations", protect, chatController.getConversations);
router.get("/:userId", protect, chatController.getConversationMessages);
router.post("/", protect, chatController.createMessage);
router.delete("/messages/:messageId", protect, chatController.deleteMessage);
router.delete("/conversations/:userId", protect, chatController.clearConversation);

module.exports = router;
