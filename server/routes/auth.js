const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();
const shouldDebugLog = process.env.AUTH_DEBUG_LOGS === 'true';

// In-memory user storage (ephemeral - lost on server restart)
const ephemeralUsers = new Map(); // username -> userId

// Simple username-only registration (no password needed!)
router.post('/register', async (req, res) => {
  try {
    const { username } = req.body;

    // Validation
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
    }

    // Check if username is taken (in this session)
    if (ephemeralUsers.has(username)) {
      return res.status(400).json({ error: 'Username already taken - choose another' });
    }

    // Create ephemeral user
    const userId = Date.now().toString() + Math.random().toString(36);
    ephemeralUsers.set(username, userId);

    // Generate token
    const token = jwt.sign(
      { userId, username },
      process.env.JWT_SECRET || 'ephemeral_secret_key',
      { expiresIn: '24h' }
    );

    if (shouldDebugLog) {
      console.log('User registered (ephemeral session)');
    }

    res.status(201).json({
      message: 'Joined successfully',
      token,
      user: {
        id: userId,
        username
      }
    });
  } catch (error) {
    console.error('Register error');
    if (shouldDebugLog) {
      console.error(error);
    }
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
