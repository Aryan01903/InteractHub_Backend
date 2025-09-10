const Whiteboard = require('../models/board.model');

exports.createWhiteboard = async (req, res) => {
  const { name, data } = req.body;
  const { _id: userId, tenantId } = req.user;

  try {
    const whiteboard = await Whiteboard.create({
      name,
      data,
      tenantId,
      createdBy: userId,
    });
    res.status(201).json(whiteboard);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
};

exports.updateWhiteboard = async (req, res) => {
  const { id } = req.params;
  const { data, version } = req.body;
  const { _id: userId, tenantId } = req.user;

  try {
    const board = await Whiteboard.findOne({ _id: id, tenantId });
    if (!board) {
      return res.status(404).json({
        error: 'Whiteboard not found',
      });
    }

    if (version) {
      board.versions.push({ data: board.data });
    }
    board.data = data;
    await board.save();
    res.status(200).json(board);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
};

exports.getWhiteboards = async (req, res) => {
  try {
    const boards = await Whiteboard.find({ tenantId: req.user.tenantId });
    res.status(200).json(boards);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
};

exports.getWhiteboardsById = async (req, res) => {
  try {
    const board = await Whiteboard.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!board) {
      return res.status(404).json({
        error: 'Whiteboard not found',
      });
    }
    res.status(200).json(board);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
};
