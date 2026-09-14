const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { loginLimiter } = require('../middleware/rateLimit');
const { logAction } = require('../services/auditService');

const router = express.Router();

const generateTokens = (user) => {
  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '8h' });
  return { accessToken, refreshToken };
};

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !user.is_active) {
      await logAction(null, null, 'login_failed', 'users', null, { email, reason: 'user_not_found_or_inactive' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      await logAction(null, null, 'login_failed', 'users', user.id, { email, reason: 'invalid_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    await logAction(user.id, user.role, 'login_success', 'users', user.id, { email });

    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const result = await query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid token or user inactive' });
    }

    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

module.exports = router;
