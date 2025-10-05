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
    const { content, type = "text", files = [] } = req.body;

    if (!content && files.length === 0) {
      return res.status(400).json({ error: "Message content or file is required" });
    }

    const messageType =
      files.length > 0
        ? files[0].mimetype.startsWith("image/")
          ? "image"
          : "file"
        : type;

    const messageData = {
      tenantId: req.user.tenantId,
      sender: req.user._id,
      content: content || "",
      type: messageType,
      files: files.map(file => ({
        public_id: file.public_id,
        original_filename: file.original_filename,
        mimetype: file.mimetype,
        secure_url: file.secure_url || `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload/v1/${file.public_id}`
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
};