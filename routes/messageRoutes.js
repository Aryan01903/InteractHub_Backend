const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  markAllAsRead,
} = require("../controllers/messageController");
const authMW = require("../middlewares/authMW");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + ext);
  },
});

const upload = multer({ storage });

router.get("/", authMW, getMessages);
router.post("/", authMW, upload.array("file", 5), sendMessage);
router.put("/:id", authMW, upload.array("file", 5), editMessage);
router.delete("/:id", authMW, deleteMessage);
router.put("/:id/read", authMW, markAsRead);
router.put("/mark-all-read", authMW, markAllAsRead);

module.exports = router;
