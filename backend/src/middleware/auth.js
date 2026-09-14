const jwt = require('jsonwebtoken');
const { logAction } = require('../services/auditService');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

const authorize = (roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return [
    authenticate,
    async (req, res, next) => {
      if (!roles.length || roles.includes(req.user.role)) {
        return next();
      }
      // A09: audit the forbidden attempt
      try {
        await logAction(
          req.user.id,
          req.user.role,
          'access_denied',
          null,
          null,
          {
            method: req.method,
            path: req.originalUrl,
            required_roles: roles,
            user_role: req.user.role
          }
        );
      } catch (auditErr) {
        console.error('Failed to audit 403:', auditErr);
      }
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
  ];
};

module.exports = {
  authenticate,
  authorize
};
