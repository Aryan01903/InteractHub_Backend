const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const { startCleanupScheduler } = require('./utils/invitationCleanUp');

const app = express();
const server = http.createServer(app);

startCleanupScheduler();

// CORS configuration
const corsOptions = {
  origin: ['https://boardstack-pi.vercel.app','http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Parse JSON body
app.use(express.json());

// Test endpoint
app.get('/test-cors', (req, res)=> {
  res.json({ ok: true });
});

// Routes
const authRoutes = require('./routes/authRoutes');
const whiteboardRoutes = require('./routes/whiteboardRoutes');
const videoRoutes = require('./routes/videoRoutes')

app.use('/api/auth', authRoutes);
app.use('/api/whiteboard', whiteboardRoutes);
app.use('/api/videoCall',videoRoutes)

// Error-handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for Socket.IO
    methods: ['GET', 'POST'],
  },
});

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

// MongoDB connection
mongoose.connect(process.env.DB_URL)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });