const { validationResult } = require("express-validator");

const validateMiddleware = (validations) => [
  ...validations,
  (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    return res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  },
];

module.exports = {
  validateMiddleware,
};
