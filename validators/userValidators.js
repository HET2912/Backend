const { body } = require("express-validator");

const updateProfileSchema = [
  body("name").optional().trim().notEmpty().withMessage("name cannot be empty"),
  body("email").optional().isEmail().withMessage("invalid email"),
  body("incomeSource")
    .optional()
    .isIn(["salary", "business", "freelance", "investment", "investments", "other"])
    .withMessage("invalid incomeSource"),
  body("phoneNumber")
    .optional()
    .customSanitizer((value) => (value === null || value === undefined ? "" : String(value).trim()))
    .custom((value) => {
      if (!value) return true;
      return /^[+]?[\d\s().-]{7,20}$/.test(value);
    })
    .withMessage("phoneNumber must be a valid phone number"),
  body("monthlyIncome")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("monthlyIncome must be >= 0"),
  body("preferredCurrency")
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage("preferredCurrency must be 3 characters"),
];

const changePasswordSchema = [
  body("currentPassword").notEmpty().withMessage("currentPassword is required"),
  body("newPassword")
    .isLength({ min: 6 })
    .withMessage("newPassword must be at least 6 characters"),
];

module.exports = {
  updateProfileSchema,
  changePasswordSchema,
};
