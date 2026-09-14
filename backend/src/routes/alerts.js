const express = require('express');
const { query } = require('../db');
const { authorize } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { verifyAlertHash } = require('../services/alertHashService');

const router = express.Router();

router.get('/', authorize(['admin', 'operator', 'readonly']), async (req, res) => {
  const { from, to, camera_id, plate, reviewed, limit = 50, offset = 0 } = req.query;
  
  let q = `
    SELECT a.*, d.camera_id, d.timestamp_camera, d.frame_ref, d.plate_raw 
    FROM alerts a
    JOIN detections d ON a.detection_id = d.id AND a.detection_ts = d.timestamp_received
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;

  if (from) {
    q += ` AND a.signed_at >= $${paramIdx++}`;
    params.push(from);
  }
  if (to) {
    q += ` AND a.signed_at <= $${paramIdx++}`;
    params.push(to);
  }
  if (camera_id) {
    q += ` AND d.camera_id = $${paramIdx++}`;
    params.push(camera_id);
  }
  if (plate) {
    q += ` AND a.plate_matched = $${paramIdx++}`;
    params.push(plate);
  }
  if (reviewed !== undefined) {
    q += ` AND a.reviewed = $${paramIdx++}`;
    params.push(reviewed === 'true');
  }

  q += ` ORDER BY a.signed_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(parseInt(limit), parseInt(offset));

  try {
    const result = await query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authorize(['admin', 'operator', 'readonly']), async (req, res) => {
  try {
    const result = await query(`
      SELECT a.*, d.camera_id, d.timestamp_camera, d.frame_ref, d.plate_raw
      FROM alerts a
      JOIN detections d ON a.detection_id = d.id AND a.detection_ts = d.timestamp_received
      WHERE a.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = result.rows[0];
    
    // timestamp_camera from Postgres might be Date object, convert to ISO for hash check
    const tsStr = (alert.timestamp_camera instanceof Date) 
      ? alert.timestamp_camera.toISOString() 
      : alert.timestamp_camera;

    const isValid = verifyAlertHash(
      alert.alert_hash,
      alert.frame_ref,
      alert.plate_matched,
      tsStr,
      alert.camera_id
    );

    res.json({ ...alert, hash_valid: isValid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/review', authorize(['admin']), async (req, res) => {
  try {
    const result = await query(`
      UPDATE alerts SET reviewed = true, reviewed_by = $1, reviewed_at = NOW()
      WHERE id = $2 RETURNING *
    `, [req.user.id, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    await logAction(req.user.id, req.user.role, 'review_alert', 'alerts', req.params.id, { id: req.params.id });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
