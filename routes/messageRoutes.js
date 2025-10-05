const express = require("express");
const router = express.Router();
const authMW = require("../middlewares/authMW");
const multer = require("multer");
const {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  markAllAsRead,
  uploadFiles,
} = require("../controllers/messageController");

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedFileTypes = ["image/jpeg", "image/jpg", "image/png", "audio/mpeg", "application/pdf"];
    if (allowedFileTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"), false);
    }
  },
});

module.exports = (io) => {
  router.use(authMW);
  router.get("/", getMessages);
  router.post("/", (req, res) => sendMessage(req, res, io));
  router.post("/upload", upload.array("files"), uploadFiles);
  router.put("/read/all", (req, res) => markAllAsRead(req, res, io));
  router.put("/:id", editMessage);
  router.delete("/:id", deleteMessage);
  router.put("/:id/read", markAsRead);
  return router;
};