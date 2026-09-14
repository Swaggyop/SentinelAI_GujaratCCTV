const rateLimit = require('express-rate-limit');
const { query } = require('../db');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP, please try again after 15 minutes' },
  handler: async (req, res, next, options) => {
    const ip = req.ip;
    const email = req.body.email || 'unknown';
    
    try {
      await query(
        `INSERT INTO audit_log (actor, actor_role, action, target_table, target_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [null, null, 'login_rate_limit_exceeded', 'users', null, JSON.stringify({ ip, email })]
      );
    } catch (err) {
      console.error('Failed to log rate limit to audit_log:', err);
    }
    
    res.status(options.statusCode).send(options.message);
  }
});

module.exports = {
  loginLimiter
};
