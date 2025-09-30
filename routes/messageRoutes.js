const express = require("express");
const router = express.Router();
const {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  markAllAsRead,
  upload, // multer middleware
} = require("../controllers/messageController");
const authMW = require("../middlewares/authMW");

module.exports = function (io) {
  router.use(authMW);
  router.put("/read/all", (req, res) => markAllAsRead(req, res, io));
  router.get("/", getMessages);
  router.post("/", upload.array("files", 5), (req, res) => sendMessage(req, res, io));
  router.put("/:id", editMessage);
  router.delete("/:id", deleteMessage);
  router.put("/:id/read", markAsRead);
  return router;
};
