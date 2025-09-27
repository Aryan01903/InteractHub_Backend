// routes/messageRoutes.js
const express = require("express");
const router = express.Router();
const {
  sendMessage,
  getMessages,
  markAsRead,
} = require("../controllers/messageController");
const authMiddleware = require("../middlewares/authMW");

router.post("/", authMiddleware, sendMessage);

router.get("/", authMiddleware, getMessages);

router.put("/:id/read", authMiddleware, markAsRead);

module.exports = router;
