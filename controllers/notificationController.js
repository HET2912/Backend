const Notification = require("../models/Notification");

const getNotifications = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Notification.countDocuments({ userId });
        const unreadCount = await Notification.countDocuments({ userId, read: false });

        return res.status(200).json({
            success: true,
            notifications,
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return next(error);
    }
};

const getUnreadCount = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const unreadCount = await Notification.countDocuments({ userId, read: false });

        return res.status(200).json({
            success: true,
            unreadCount,
        });
    } catch (error) {
        return next(error);
    }
};

const markAsRead = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { notificationId } = req.params;

        if (notificationId === "all") {
            await Notification.updateMany({ userId }, { read: true });
        } else {
            await Notification.findOneAndUpdate(
                { _id: notificationId, userId },
                { read: true }
            );
        }

        return res.status(200).json({ success: true, message: "Notification(s) marked as read" });
    } catch (error) {
        return next(error);
    }
};

const deleteNotification = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { notificationId } = req.params;

        await Notification.findOneAndDelete({ _id: notificationId, userId });

        return res.status(200).json({ success: true, message: "Notification deleted" });
    } catch (error) {
        return next(error);
    }
};

const createNotification = async (userId, type, title, message, data = {}) => {
    try {
        const notification = await Notification.create({
            userId,
            type,
            title,
            message,
            data,
        });
        return notification;
    } catch (error) {
        console.error("Error creating notification:", error);
        return null;
    }
};

module.exports = {
    getNotifications,
    getUnreadCount,
    markAsRead,
    deleteNotification,
    createNotification,
};
