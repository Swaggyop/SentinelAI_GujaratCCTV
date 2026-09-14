const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Heartbeats: any authenticated user/service can post.
// ANPR service sends these to distinguish "no plates seen" from "camera down".
router.post('/', authenticate, async (req, res) => {
  const { camera_id, status, detail } = req.body;
  if (!camera_id || !status) {
    return res.status(400).json({ error: 'Missing required fields: camera_id, status' });
  }

  const validStatuses = ['ok', 'degraded', 'down'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    // Verify camera exists
    const camResult = await query('SELECT id FROM cameras WHERE id = $1', [camera_id]);
    if (camResult.rows.length === 0) {
      return res.status(400).json({ error: `Unknown camera_id: ${camera_id}` });
    }

    const result = await query(
      'INSERT INTO camera_heartbeats (camera_id, status, detail) VALUES ($1, $2, $3) RETURNING *',
      [camera_id, status, detail || null]
    );

    // Update camera stream_health
    await query(
      'UPDATE cameras SET stream_health = $1 WHERE id = $2',
      [status, camera_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Heartbeat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
