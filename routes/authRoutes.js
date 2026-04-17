const express = require("express");
const authController = require("../controllers/authController");
const { authRateLimiter } = require("../middlewares/rateLimiter");
const { validateMiddleware } = require("../middlewares/validateMiddleware");
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validators/authValidators");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(authRateLimiter);
router.post("/register", ...validateMiddleware(registerSchema), authController.register);
router.post("/login", ...validateMiddleware(loginSchema), authController.login);
router.post("/logout", authController.logout);
router.post(
  "/forgot-password",
  ...validateMiddleware(forgotPasswordSchema),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  ...validateMiddleware(resetPasswordSchema),
  authController.resetPassword
);
router.get("/me", protect, authController.getMe);

module.exports = router;
