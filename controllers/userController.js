const bcrypt = require("bcryptjs");
const User = require("../models/User");

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-passwordHash -refreshToken");
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({ success: true, user });
  } catch (err) {
    return next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      "name",
      "email",
      "incomeSource",
      "monthlyIncome",
      "preferredCurrency",
      "profilePicture",
      "phoneNumber",
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-passwordHash -refreshToken");

    return res.status(200).json({ success: true, user });
  } catch (err) {
    return next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      const error = new Error("currentPassword and newPassword are required");
      error.statusCode = 400;
      return next(error);
    }

    const user = await User.findById(req.user._id);
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      const error = new Error("Current password is incorrect");
      error.statusCode = 401;
      return next(error);
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.refreshToken = null;
    await user.save();

    return res
      .status(200)
      .json({ success: true, message: "Password changed successfully. Please log in again." });
  } catch (err) {
    return next(err);
  }
};

const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.uploadedAvatarUrl) {
      const error = new Error("Avatar URL missing from Cloudinary middleware");
      error.statusCode = 400;
      return next(error);
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture: req.uploadedAvatarUrl },
      { new: true, runValidators: true }
    ).select("-passwordHash -refreshToken");

    return res.status(200).json({
      success: true,
      message: "Avatar uploaded successfully",
      user,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  uploadAvatar,
};
