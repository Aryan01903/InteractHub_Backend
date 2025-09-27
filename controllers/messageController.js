const Message = require("../models/message.model");

exports.sendMessage = async (req, res) => {
  try {
    const { content, type = "text" } = req.body;
    const { tenantId, _id } = req.user;

    if (!content) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const message = new Message({
      tenantId,
      sender: _id,
      content,
      type,
    });

    await message.save();

    const populated = await message.populate("sender", "name email role");

    res.status(201).json(populated);
  } catch (err) {
    console.error("Error sending message:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const messages = await Message.find({ tenantId })
      .populate("sender", "name email role")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const message = await Message.findByIdAndUpdate(
      id,
      { $addToSet: { readBy: userId } },
      { new: true }
    )
      .populate("sender", "name email role")
      .populate("readBy", "name email role");

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json(message);
  } catch (err) {
    console.error("Error marking message as read:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};
