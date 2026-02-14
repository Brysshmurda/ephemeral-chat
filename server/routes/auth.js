const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// In-memory user storage (ephemeral - lost on server restart)
const ephemeralUsers = new Map(); // username -> { password, userId }

// Simple session-based registration (no persistence)
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be between 3 and 20 characters' });
    }

    // Check if username is taken (in this session)
    if (ephemeralUsers.has(username)) {
      return res.status(400).json({ error: 'Username already taken in this session' });
    }

    // Create ephemeral user
    const userId = Date.now().toString() + Math.random().toString(36);
    ephemeralUsers.set(username, { password, userId });

    // Generate token
    const token = jwt.sign(
      { userId, username },
      process.env.JWT_SECRET || 'ephemeral_secret_key',
      { expiresIn: '24h' }
    );

    console.log(`✅ User registered (ephemeral): ${username}`);

    res.status(201).json({
      message: 'Session created successfully',
      token,
      user: {
        id: userId,
        username
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Simple login (checks ephemeral storage)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user in ephemeral storage
    const user = ephemeralUsers.get(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials or session expired' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.userId, username },
      process.env.JWT_SECRET || 'ephemeral_secret_key',
      { expiresIn: '24h' }
    );

    console.log(`✅ User logged in (ephemeral): ${username}`);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.userId,
        username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
