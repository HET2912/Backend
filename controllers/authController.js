const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

const signAccessToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET || "dev_jwt_secret", {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

const signRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET || "dev_refresh_secret", {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

const sendAuthResponse = async (res, user, statusCode = 200) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save();

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture,
      incomeSource: user.incomeSource,
      monthlyIncome: user.monthlyIncome,
      preferredCurrency: user.preferredCurrency,
    },
  });
};

const register = async (req, res, next) => {
  try {
    const { name, email, password, incomeSource, monthlyIncome, preferredCurrency } = req.body;
    if (!name || !email || !password) {
      const error = new Error("name, email and password are required");
      error.statusCode = 400;
      return next(error);
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      const error = new Error("User already exists");
      error.statusCode = 409;
      return next(error);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      incomeSource,
      monthlyIncome,
      preferredCurrency,
    });

    return sendAuthResponse(res, user, 201);
  } catch (err) {
    return next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      const error = new Error("email and password are required");
      error.statusCode = 400;
      return next(error);
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      const error = new Error("Invalid credentials");
      error.statusCode = 401;
      return next(error);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const error = new Error("Invalid credentials");
      error.statusCode = 401;
      return next(error);
    }

    return sendAuthResponse(res, user);
  } catch (err) {
    return next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    if (refreshToken) {
      const user = await User.findOne({ refreshToken });
      if (user) {
        user.refreshToken = null;
        await user.save();
      }
    }

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    return next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      const error = new Error("email is required");
      error.statusCode = 400;
      return next(error);
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res
        .status(200)
        .json({ success: true, message: "If account exists, reset instructions sent" });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // TODO: send rawToken via email link.
    return res.status(200).json({
      success: true,
      message: "Reset token generated",
      resetToken: rawToken,
    });
  } catch (err) {
    return next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      const error = new Error("token and password are required");
      error.statusCode = 400;
      return next(error);
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      const error = new Error("Invalid or expired reset token");
      error.statusCode = 400;
      return next(error);
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.refreshToken = null;
    await user.save();

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    return res.status(200).json({ success: true, message: "Password reset successful" });
  } catch (err) {
    return next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const token =
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : req.cookies?.accessToken;

    if (!token) {
      const error = new Error("Not authorized");
      error.statusCode = 401;
      return next(error);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_jwt_secret");
    const user = await User.findById(decoded.id).select("-passwordHash -refreshToken");
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      return next(error);
    }

    return res.status(200).json({ success: true, user });
  } catch (err) {
    err.statusCode = 401;
    return next(err);
  }
};

module.exports = {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
};
