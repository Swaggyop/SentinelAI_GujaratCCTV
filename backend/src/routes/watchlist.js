const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const { authorize } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

router.get('/', authorize(['admin', 'operator']), async (req, res) => {
  try {
    const result = await query('SELECT * FROM watchlist WHERE active = true ORDER BY added_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authorize(['admin']), async (req, res) => {
  const { plate_raw, plate_normalized, reason } = req.body;
  if (!plate_raw || !plate_normalized || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (!/^[A-Z0-9]{4,12}$/.test(plate_normalized)) {
    return res.status(400).json({ error: 'Invalid plate_normalized format' });
  }

  const id = uuidv4();
  try {
    const result = await query(`
      INSERT INTO watchlist (id, plate_raw, plate_normalized, reason, added_by, active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [id, plate_raw, plate_normalized, reason, req.user.id]);

    await logAction(req.user.id, req.user.role, 'add_watchlist', 'watchlist', id, { plate_normalized, reason });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/deactivate', authorize(['admin']), async (req, res) => {
  try {
    const result = await query(`
      UPDATE watchlist SET active = false, deactivated_at = NOW(), deactivated_by = $1
      WHERE id = $2 AND active = true
      RETURNING *
    `, [req.user.id, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Watchlist entry not found or already inactive' });
    }

    await logAction(req.user.id, req.user.role, 'deactivate_watchlist', 'watchlist', req.params.id, { id: req.params.id });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
