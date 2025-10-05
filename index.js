const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { startCleanupScheduler } = require("./utils/invitationCleanUp");
const path = require("path");

const app = express();
const server = http.createServer(app);
startCleanupScheduler();

// CORS configuration
const corsOptions = {
  origin: [
    "https://boardstack-pi.vercel.app",
    "https://interacthub.vercel.app",
    "http://localhost:5173",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// Test endpoint
app.get("/test-cors", (req, res) => {
  res.json({ ok: true });
});

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: [
      "https://boardstack-pi.vercel.app",
      "https://interacthub.vercel.app",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token provided"));
    const decoded = jwt.verify(token, process.env.SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Whiteboard events
  socket.on("joinBoard", async (boardId) => {
    socket.join(boardId);
    console.log(`Client ${socket.id} joined board ${boardId}`);
    try {
      const Whiteboard = mongoose.model("Whiteboard");
      const whiteboard = await Whiteboard.findById(boardId);
      if (whiteboard && whiteboard.data) {
        socket.emit("initialWhiteboardState", { data: whiteboard.data });
      }
    } catch (err) {
      console.error("Error fetching initial whiteboard state:", err.message);
    }
  });

  socket.on("whiteboardUpdate", ({ boardId, data }) => {
    socket.to(boardId).emit("whiteboardUpdate", data);
  });

  // Video call events
  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
    console.log(`Client ${socket.id} joined video room ${roomId}`);
    console.log(`Current sockets in room ${roomId}:`, io.sockets.adapter.rooms.get(roomId)?.size || 0);
    socket.to(roomId).emit("new-user", { socketId: socket.id });
  });

  socket.on("initiate", ({ socketId }) => {
    console.log(`Received initiate from ${socket.id} for ${socketId}`);
    io.to(socketId).emit("initiate", { socketId: socket.id });
  });

  socket.on("offer", ({ offer, to }) => {
    console.log(`Received offer from ${socket.id} to ${to}`);
    io.to(to).emit("offer", { offer, from: socket.id });
  });

  socket.on("answer", ({ answer, to }) => {
    console.log(`Received answer from ${socket.id} to ${to}`);
    io.to(to).emit("answer", { answer, from: socket.id });
  });

  socket.on("ice-candidate", ({ candidate, to }) => {
    console.log(`Received ICE candidate from ${socket.id} to ${to}`);
    io.to(to).emit("ice-candidate", { candidate, from: socket.id });
  });

  // Live video chat
  socket.on("chat-message", ({ roomId, message }) => {
    console.log(`Received chat message from ${socket.id} in room ${roomId}: ${message}`);
    io.to(roomId).emit("chat-message", message);
  });

  // Tenant-wide chat
  const tenantRoom = `tenant:${socket.user.tenantId}`;
  socket.join(tenantRoom);
  const cloudinary = require("./utils/cloudinaryConfig");

  socket.on("sendMessage", async ({ content, type = "text", file }) => {
    try {
      let uploadedFileUrl = null;

      if (type === "file" && file) {
        const uploadResponse = await cloudinary.uploader.upload(file, {
          folder: `interacthub/${socket.user.tenantId}`,
        });
        uploadedFileUrl = uploadResponse.secure_url;
      }
      const Message = require("./models/message.model");
      const message = new Message({
        tenantId: socket.user.tenantId,
        sender: socket.user._id,
        content: uploadedFileUrl || content,
        type,
      });
      await message.save();
      const populated = await message.populate("sender", "name email role");
      io.to(tenantRoom).emit("newMessage", populated);
    } catch (err) {
      console.error("Error saving tenant message:", err.message);
    }
  });

  socket.on("editMessage", async ({ messageId, newContent }) => {
    try {
      const Message = require("./models/message.model");
      const message = await Message.findByIdAndUpdate(
        messageId,
        { content: newContent, updatedAt: Date.now() },
        { new: true }
      ).populate("sender", "name email role");

      if (message) io.to(tenantRoom).emit("messageEdited", message);
    } catch (err) {
      console.error("Error editing message:", err.message);
    }
  });

  socket.on("deleteMessage", async ({ messageId }) => {
    try {
      const Message = require("./models/message.model");
      await Message.findByIdAndDelete(messageId);
      io.to(tenantRoom).emit("messageDeleted", { messageId });
    } catch (err) {
      console.error("Error deleting message:", err.message);
    }
  });

  socket.on("markAsRead", async (messageId) => {
    try {
      const Message = require("./models/message.model");
      const message = await Message.findByIdAndUpdate(
        messageId,
        { $addToSet: { readBy: socket.user._id } },
        { new: true }
      )
        .populate("sender", "name email role")
        .populate("readBy", "name email role");

      if (message) io.to(tenantRoom).emit("messageRead", message);
    } catch (err) {
      console.error("Error marking message as read:", err.message);
    }
  });

  socket.on("typing", () => {
    socket.to(tenantRoom).emit("userTyping", {
      userId: socket.user._id,
      name: socket.user.name,
    });
  });

  socket.on("stopTyping", () => {
    socket.to(tenantRoom).emit("userStopTyping", {
      userId: socket.user._id,
      name: socket.user.name,
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    rooms.forEach((roomId) => {
      console.log(`Notifying room ${roomId} of user ${socket.id} leaving`);
      socket.to(roomId).emit("user-left", { socketId: socket.id });
    });
  });
});

// Routes
const authRoutes = require("./routes/authRoutes");
const whiteboardRoutes = require("./routes/whiteboardRoutes");
const videoRoutes = require("./routes/videoRoutes");
const messageRoutes = require("./routes/messageRoutes")(io);

app.use("/api/auth", authRoutes);
app.use("/api/whiteboard", whiteboardRoutes);
app.use("/api/videoCall", videoRoutes);
app.use("/api/messages", messageRoutes);

// Error-handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// MongoDB connection
mongoose
  .connect(process.env.DB_URL)
  .then(() => {
    console.log("Connected to MongoDB");
    const port = process.env.PORT;
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
  });