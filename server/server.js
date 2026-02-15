const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const socketHandler = require('./sockets/socketHandler');
const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const canInfoLog = logLevel !== 'none' && logLevel !== 'error';

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/$/, '');
const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

if (!allowedOrigins.includes('http://localhost:3000')) {
  allowedOrigins.push('http://localhost:3000');
}

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  maxHttpBufferSize: 5e6,
  cors: {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const cleanedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.includes(cleanedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Socket CORS blocked for origin'));
    },
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// NO DATABASE - Everything is ephemeral!
if (canInfoLog) {
  console.log('🔥 Running in FULLY EPHEMERAL mode - no database!');
}

// Routes
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Ghost Chat Server Running - Fully Ephemeral Mode');
});

// Socket.IO handler
socketHandler(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  if (canInfoLog) {
    console.log(`🚀 Server running on port ${PORT}`);
  }
});
