const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const { startCleanupScheduler } = require('./utils/invitationCleanUp');
const Whiteboard = require('./models/board.model');

const app = express();
const server = http.createServer(app);

startCleanupScheduler();

// CORS configuration
const corsOptions = {
  origin: ['https://boardstack-pi.vercel.app','https://interacthub.vercel.app','http://localhost:5173'],
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
  
  socket.on('joinBoard', async (boardId) => {
    socket.join(boardId);
    console.log(`Client ${socket.id} joined board ${boardId}`);

    // Fetch and send initial whiteboard state
    try {
      const whiteboard = await Whiteboard.findById(boardId);
      if (whiteboard && whiteboard.data) {
        socket.emit('initialWhiteboardState', { data: whiteboard.data });
        console.log(`Sent initialWhiteboardState for board ${boardId}`);
      }
    } catch (err) {
      console.error('Error fetching initial whiteboard state:', err.message);
    }
  });
  
  socket.on('whiteboardUpdate', ({ boardId, data }) => {
    console.log(`Received whiteboardUpdate for board ${boardId}:`, data);
    socket.to(boardId).emit('whiteboardUpdate', data);
    console.log(`Broadcasted whiteboardUpdate to board ${boardId}`);
  });
  
  // Video Call Signaling
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`Client ${socket.id} joined video room ${roomId}`);
  });

  socket.on('offer', ({ roomId, offer, from }) => {
    socket.to(roomId).emit('offer', { offer, from });
  });

  socket.on('answer', ({ roomId, answer, from }) => {
    socket.to(roomId).emit('answer', { answer, from });
  });

  socket.on('ice-candidate', ({ roomId, candidate, from }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, from });
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
