const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',           // Vite local dev
  'http://localhost:3000',           // Other local port
  'https://boardstack.onrender.com', // deployed frontend
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Allow the origin
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // For preflight requests

// Parse JSON body
app.use(express.json());

// Set up Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// MongoDB connection
mongoose.connect(process.env.DB_URL)
  .then(() => {
    console.log('Connected to MongoDB');
    server.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });

// ROUTES
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


// Socket.IO setup
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
