const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");

const getChatUsers = async (req, res, next) => {
    try {
        const users = await User.find({ _id: { $ne: req.user._id } })
            .select("_id name email profilePicture")
            .sort({ name: 1 });

        return res.status(200).json({ success: true, users });
    } catch (error) {
        return next(error);
    }
};

const getConversations = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const messages = await Message.find({
            $or: [{ senderId: userId }, { receiverId: userId }],
            groupId: null,
        })
            .sort({ createdAt: -1 })
            .lean();

        const conversationsMap = new Map();

        for (const message of messages) {
            const senderId = message.senderId.toString();
            const receiverId = message.receiverId ? message.receiverId.toString() : null;
            const peerId = senderId === userId.toString() ? receiverId : senderId;
            if (!peerId) {
                continue;
            }

            const existing = conversationsMap.get(peerId);
            if (!existing) {
                conversationsMap.set(peerId, {
                    userId: peerId,
                    lastMessage: message.content,
                    lastMessageAt: message.createdAt,
                    unreadCount: 0,
                });
            }

            if (
                receiverId === userId.toString() &&
                !message.readBy?.some((id) => id.toString() === userId.toString())
            ) {
                const conversation = conversationsMap.get(peerId);
                conversation.unreadCount += 1;
            }
        }

        const peerIds = Array.from(conversationsMap.keys());
        const peers = await User.find({ _id: { $in: peerIds } })
            .select("_id name profilePicture")
            .lean();

        const conversations = peerIds
            .map((peerId) => {
                const conversation = conversationsMap.get(peerId);
                const peer = peers.find((user) => user._id.toString() === peerId);
                return {
                    ...conversation,
                    name: peer?.name || "Unknown User",
                    profilePicture: peer?.profilePicture || "",
                };
            })
            .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

        return res.status(200).json({ success: true, conversations });
    } catch (error) {
        return next(error);
    }
};

const getConversationMessages = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const otherUserId = req.params.userId;

        if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
            const error = new Error("Invalid user ID");
            error.statusCode = 400;
            return next(error);
        }

        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: userId },
            ],
        })
            .sort({ createdAt: 1 })
            .lean();

        const unreadIds = messages
            .filter(
                (message) =>
                    message.receiverId?.toString() === userId.toString() &&
                    !message.readBy?.some((id) => id.toString() === userId.toString()),
            )
            .map((message) => message._id);

        if (unreadIds.length > 0) {
            await Message.updateMany(
                { _id: { $in: unreadIds } },
                { $addToSet: { readBy: userId } },
            );
        }

        return res.status(200).json({ success: true, messages });
    } catch (error) {
        return next(error);
    }
};

const createMessage = async (req, res, next) => {
    try {
        const { receiverId, content, groupId } = req.body;
        const senderId = req.user._id;

        if (!content || !content.trim()) {
            const error = new Error("Message content is required");
            error.statusCode = 400;
            return next(error);
        }

        if (!receiverId && !groupId) {
            const error = new Error("receiverId or groupId is required");
            error.statusCode = 400;
            return next(error);
        }

        if (receiverId && !mongoose.Types.ObjectId.isValid(receiverId)) {
            const error = new Error("Invalid receiver ID");
            error.statusCode = 400;
            return next(error);
        }

        const message = await Message.create({
            senderId,
            receiverId: receiverId || null,
            groupId: groupId || null,
            content: content.trim(),
        });

        // Emit real-time event via Socket.IO if available
        try {
            const io = req.app.get("io");
            if (io) {
                // Emit to receiver (direct message)
                if (receiverId) {
                    io.to(receiverId.toString()).emit("newMessage", message);
                }

                // Emit to sender so sender UI updates too
                if (senderId) {
                    io.to(senderId.toString()).emit("newMessage", message);
                }

                // Emit to group room if group message
                if (groupId) {
                    io.to(`group_${groupId}`).emit("newMessage", message);
                }
            }
        } catch (emitErr) {
            // ignore emission errors
            console.error("Socket emit error:", emitErr?.message || emitErr);
        }

        return res.status(201).json({ success: true, message });
    } catch (error) {
        return next(error);
    }
};

const deleteMessage = async (req, res, next) => {
    try {
        const messageId = req.params.messageId;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            const error = new Error("Invalid message ID");
            error.statusCode = 400;
            return next(error);
        }

        const message = await Message.findById(messageId);
        if (!message) {
            const error = new Error("Message not found");
            error.statusCode = 404;
            return next(error);
        }

        if (message.senderId.toString() !== userId.toString()) {
            const error = new Error("You can only delete your own messages");
            error.statusCode = 403;
            return next(error);
        }

        await Message.findByIdAndDelete(messageId);

        return res.status(200).json({ success: true, message: "Message deleted" });
    } catch (error) {
        return next(error);
    }
};

const clearConversation = async (req, res, next) => {
    try {
        const otherUserId = req.params.userId;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
            const error = new Error("Invalid user ID");
            error.statusCode = 400;
            return next(error);
        }

        await Message.deleteMany({
            $or: [
                { senderId: userId, receiverId: otherUserId },
                { senderId: otherUserId, receiverId: userId },
            ],
        });

        return res.status(200).json({ success: true, message: "Conversation cleared" });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getChatUsers,
    getConversations,
    getConversationMessages,
    createMessage,
    deleteMessage,
    clearConversation,
};
