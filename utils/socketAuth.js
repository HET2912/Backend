const jwt = require("jsonwebtoken");
const User = require("../models/User");

const verifySocketToken = async (token) => {
    if (!token) throw new Error("Token missing");
    const secret = process.env.JWT_SECRET || "dev_jwt_secret";
    const decoded = jwt.verify(token, secret);
    if (!decoded || !decoded.id) throw new Error("Invalid token");
    const user = await User.findById(decoded.id).select("-passwordHash -refreshToken");
    if (!user) throw new Error("User not found");
    return user;
};

module.exports = { verifySocketToken };
