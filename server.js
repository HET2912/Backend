require("dotenv").config();

const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

const allowedOrigins = [process.env.FRONTEND_ORIGIN || "http://localhost:5173", "http://localhost:5174",
  "https://fin-x-dgj4.vercel.app/"];

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");

    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Make io available in controllers via app.get('io')
    app.set("io", io);

    // Socket auth middleware — verify JWT from client handshake
    const { verifySocketToken } = require("./utils/socketAuth");

    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token || (socket.handshake.headers && (socket.handshake.headers.authorization || "").split(" ")[1]);
        if (!token) return next(new Error("Not authorized"));
        const user = await verifySocketToken(token);
        socket.user = user;
        return next();
      } catch (err) {
        return next(new Error("Not authorized"));
      }
    });

    io.on("connection", (socket) => {
      console.log("⚡️ Socket connected:", socket.id, "user:", socket.user?._id);

      // auto-join personal room
      if (socket.user && socket.user._id) {
        socket.join(socket.user._id.toString());
      }

      socket.on("join", (userId) => {
        if (userId) {
          socket.join(userId.toString());
        }
      });

      socket.on("joinGroup", (groupId) => {
        if (groupId) socket.join(`group_${groupId}`);
      });

      socket.on("disconnect", () => {
        // console.log("Socket disconnected", socket.id);
      });
    });

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
