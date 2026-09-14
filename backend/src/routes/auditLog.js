const express = require('express');
const { query } = require('../db');
const { authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authorize(['admin']), async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  
  try {
    const result = await query(
      'SELECT * FROM audit_log ORDER BY ts DESC LIMIT $1 OFFSET $2',
      [parseInt(limit), parseInt(offset)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
