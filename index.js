const express = require('express');
app.use(cors(corsOptions));
const app = express();
require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const corsOptions = {
  origin: '*', // allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle preflight requests


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

// Middleware
app.use(express.json());

// Routes
const authRoutes = require('./routes/authRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const whiteboardRoutes = require('./routes/whiteboardRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/invites', inviteRoutes); 
app.use('/api/auditLogs', auditLogRoutes);
app.use('/api/whiteboard', whiteboardRoutes);

// MongoDB Connection
mongoose.connect(process.env.DB_URL)
.then(() => {
  console.log("Connected to MongoDB");
  server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
  });
})
.catch((err) => {
  console.log("MongoDB Connection Error:", err);
});

// Socket.IO for real-time whiteboard
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinBoard', (boardId) => {
    socket.join(boardId);
    console.log(`Client ${socket.id} joined board ${boardId}`);
  });

  socket.on('whiteboardUpdate', ({ boardId, data }) => {
    socket.to(boardId).emit('whiteboardUpdate', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});
