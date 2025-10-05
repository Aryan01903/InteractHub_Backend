const mongoose = require("mongoose");
const Message = require("../models/message.model");
const cloudinary = require("../utils/cloudinaryConfig");

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
    const { content = "", files = [] } = req.body;

    if (!content && files.length === 0) {
      return res.status(400).json({ error: "Message content or file is required" });
    }

    const allowedFileTypes = ["image/jpeg", "image/jpg", "image/png", "audio/mpeg", "application/pdf"];
    files.forEach((file) => {
      if (!allowedFileTypes.includes(file.mimetype)) {
        throw new Error(`Unsupported file type: ${file.mimetype}`);
      }
    });

    const messageType = files.length > 0
      ? files[0].mimetype.startsWith("image/")
        ? "image"
        : "file"
      : "text";

    const messageData = {
      tenantId: req.user.tenantId,
      sender: req.user._id,
      content: content || "",
      type: messageType,
      files: files.map((file) => ({
        public_id: file.public_id,
        original_filename: file.original_filename,
        mimetype: file.mimetype,
        secure_url: file.secure_url,
      })),
      readBy: [],
    };

    const message = new Message(messageData);
    await message.save();
    const populated = await message.populate("sender", "name email role");

    io.to(`tenant:${req.user.tenantId}`).emit("newMessage", populated);
    res.status(201).json(populated);
  } catch (err) {
    console.error("sendMessage error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
    res.status(500).json({ error: err.message || "Internal server error" });
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

const uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    const allowedFileTypes = ["image/jpeg", "image/jpg", "image/png", "audio/mpeg", "application/pdf"];
    const maxFileSize = 10 * 1024 * 1024; // 10MB

    const uploadedFiles = await Promise.all(
      req.files.map(async (file) => {
        if (!allowedFileTypes.includes(file.mimetype)) {
          throw new Error(`Unsupported file type: ${file.mimetype}`);
        }
        if (file.size > maxFileSize) {
          throw new Error(`File ${file.originalname} exceeds 10MB limit`);
        }

        const resourceType = file.mimetype.startsWith("image/") ? "image" : "raw";

        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              resource_type: resourceType,
              folder: `tenant_${req.user.tenantId}`,
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(file.buffer);
        });

        return {
          public_id: result.public_id,
          secure_url: result.secure_url,
          mimetype: file.mimetype,
          original_filename: file.originalname,
        };
      })
    );

    res.status(200).json(uploadedFiles);
  } catch (err) {
    console.error("File upload error:", err);
    res.status(500).json({ error: err.message || "Failed to upload files" });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  markAllAsRead,
  uploadFiles,
};