const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const socketHandler = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// NO DATABASE - Everything is ephemeral!
console.log('🔥 Running in FULLY EPHEMERAL mode - no database!');

// Routes
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Ghost Chat Server Running - Fully Ephemeral Mode');
});

// Socket.IO handler
socketHandler(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
