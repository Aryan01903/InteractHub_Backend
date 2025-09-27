const Message = require("../models/message.model");

exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({ tenantId: req.user.tenantId })
      .populate("sender", "name email role")
      .sort({ createdAt: -1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'audio/mpeg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  },
});

exports.sendMessage = async (req, res) => {
  try {
    const { content, type = 'text' } = req.body;
    const files = req.files || [];

    if (!content && files.length === 0) {
      return res.status(400).json({ error: 'Message content or file is required' });
    }

    const messageType = files.length > 0 ? (files[0].mimetype.startsWith('image/') ? 'image' : 'file') : type;

    const messageData = {
      tenantId: req.user.tenantId,
      sender: req.user._id,
      content: content || '',
      type: messageType,
      files: files.map(file => ({
        filename: file.filename,
        path: file.path,
        mimetype: file.mimetype,
        size: file.size,
      })),
      readBy: [],
    };

    const message = new Message(messageData);
    await message.save();
    const populated = await message.populate('sender', 'name email role');
    res.json(populated);
  } catch (err) {
    console.error('Error in sendMessage:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.editMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const message = await Message.findByIdAndUpdate(
      req.params.id,
      { content, updatedAt: Date.now() },
      { new: true }
    ).populate("sender", "name email role");

    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ error: "Message not found" });

    await message.remove();
    res.json({ message: "Message deleted", messageId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.markAsRead = async (req, res) => {
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

exports.markAllAsRead = async (req, res) => {
  try {
    const updateResult = await Message.updateMany(
      {
        tenantId: req.user.tenantId,
        readBy: { $ne: req.user._id }
      },
      {
        $addToSet: { readBy: req.user._id }
      }
    );

    io.to(`tenant:${req.user.tenantId}`).emit("messageRead", {
      userId: req.user._id,
      tenantId: req.user.tenantId,
    });

    res.json({ success: true, ...updateResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

