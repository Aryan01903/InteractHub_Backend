const express = require("express");
const router = express.Router();
const authMW = require("../middlewares/authMW");
const {
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markAsRead,
  markAllAsRead,
  upload,
} = require("../controllers/messageController");

module.exports = (io) => {
  router.use(authMW);
  router.get("/", getMessages);
  router.post("/", upload.array("files", 5), (req, res) => sendMessage(req, res, io));
  router.put("/read/all", (req, res) => markAllAsRead(req, res, io));
  router.put("/:id", editMessage);
  router.delete("/:id", deleteMessage);
  router.put("/:id/read", markAsRead);
  return router;
};
