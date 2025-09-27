const express = require("express");
const router = express.Router();
const {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
} = require("../controllers/messageController");
const authMW  = require("../middlewares/authMW");

router.get("/", authMW, getMessages);
router.post("/", authMW, sendMessage);
router.put("/:id", authMW, editMessage);
router.delete("/:id", authMW, deleteMessage);
router.put("/:id/read", authMW, markAsRead);

module.exports = router;
