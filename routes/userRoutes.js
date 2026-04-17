const express = require("express");
const userController = require("../controllers/userController");
const { protect } = require("../middlewares/authMiddleware");
const {
  uploadSingleAvatar,
  uploadAvatarToCloudinary,
} = require("../middlewares/uploadMiddleware");
const { validateMiddleware } = require("../middlewares/validateMiddleware");
const {
  updateProfileSchema,
  changePasswordSchema,
} = require("../validators/userValidators");

const router = express.Router();

router.get("/profile", protect, userController.getProfile);
router.patch(
  "/profile",
  protect,
  ...validateMiddleware(updateProfileSchema),
  userController.updateProfile
);
router.patch(
  "/change-password",
  protect,
  ...validateMiddleware(changePasswordSchema),
  userController.changePassword
);
router.post(
  "/avatar",
  protect,
  uploadSingleAvatar,
  uploadAvatarToCloudinary,
  userController.uploadAvatar
);

module.exports = router;
