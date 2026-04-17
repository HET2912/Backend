const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;
    const cookieToken = req.cookies?.accessToken;
    const token = bearerToken || cookieToken;

    if (!token) {
      const error = new Error("Not authorized: token missing");
      error.statusCode = 401;
      return next(error);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_jwt_secret");
    const user = await User.findById(decoded.id).select("-passwordHash -refreshToken");

    if (!user) {
      const error = new Error("Not authorized: user not found");
      error.statusCode = 401;
      return next(error);
    }

    req.user = user;
    return next();
  } catch (err) {
    err.statusCode = 401;
    return next(err);
  }
};

module.exports = {
  authMiddleware,
  protect: authMiddleware,
};
