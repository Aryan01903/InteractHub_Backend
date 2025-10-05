const mongoose = require("mongoose");
const Message = require("../models/message.model");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cloudinary = require("../utils/cloudinaryConfig");

// ===== Multer Setup =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../temp");
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "audio/mpeg",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});


const getMessages = async (req, res) => {
  try {
    const messages = await Message.find({ tenantId: req.user.tenantId })
      .populate("sender", "name email role")
      .sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const sendMessage = async (req, res, io) => {
  try {
    const { content, type = "text" } = req.body;
    const files = req.files || [];

    if (!content && files.length === 0) {
      return res.status(400).json({ error: "Message content or file is required" });
    }

    let uploadedFiles = [];

    if (files.length > 0) {
      const uploadPromises = files.map(async (file) => {
        try {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: "boardstack_uploads",
            resource_type: "auto",
          });

          fs.unlinkSync(file.path); // delete local file

          return {
            filename: file.originalname,
            path: result.secure_url,
            mimetype: file.mimetype,
            size: file.size,
          };
        } catch (err) {
          console.error("Cloudinary upload error:", err);
          fs.unlinkSync(file.path);
          throw new Error("File upload failed");
        }
      });

      uploadedFiles = await Promise.all(uploadPromises);
    }

    const messageType =
      uploadedFiles.length > 0
        ? uploadedFiles[0].mimetype.startsWith("image/")
          ? "image"
          : "file"
        : type;

    const messageData = {
      tenantId: req.user.tenantId,
      sender: req.user._id,
      content: content || "",
      type: messageType,
      files: uploadedFiles,
      readBy: [],
    };

    const message = new Message(messageData);
    await message.save();
    const populated = await message.populate("sender", "name email role");

    io.to(`tenant:${req.user.tenantId}`).emit("newMessage", populated);
    res.status(201).json(populated);
  } catch (err) {
    console.error("sendMessage error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

const editMessage = async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { content: req.body.content, updatedAt: Date.now() },
      { new: true }
    ).populate("sender", "name email role");

    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json({ message: "Message deleted", messageId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { readBy: req.user._id } },
      { new: true }
    )
      .populate("sender", "name email role")
      .populate("readBy", "name email role");

    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markAllAsRead = async (req, res, io) => {
  try {
    await Message.updateMany(
      { tenantId: req.user.tenantId, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    io.to(`tenant:${req.user.tenantId}`).emit("messageRead", { userId: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  markAllAsRead,
  upload,
};
