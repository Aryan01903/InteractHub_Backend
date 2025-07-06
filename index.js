const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: 'http://localhost:5173',
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
const tenantRoutes = require('./routes/tenantRoutes');
const inviteRoutes = require('./routes/inviteRoutes');
const auditRoutes = require('./routes/auditLogRoutes');
const whiteboardRoutes = require('./routes/whiteboardRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/whiteboard', whiteboardRoutes);

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