const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (process.env.NODE_ENV !== "test") {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    code: err.code || "UNHANDLED_ERROR",
    details: err.details || null,
    ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
  });
};

module.exports = errorHandler;
