const { body } = require("express-validator");

const registerSchema = [
  body("name").trim().notEmpty().withMessage("name is required"),
  body("email").isEmail().withMessage("valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("password must be at least 6 characters"),
];

const loginSchema = [
  body("email").isEmail().withMessage("valid email is required"),
  body("password").notEmpty().withMessage("password is required"),
];

const forgotPasswordSchema = [
  body("email").isEmail().withMessage("valid email is required"),
];

const resetPasswordSchema = [
  body("token").notEmpty().withMessage("token is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("password must be at least 6 characters"),
];

module.exports = {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
