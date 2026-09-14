const express = require('express');
const { query } = require('../db');
const { authorize } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { validateCameraId } = require('../utils/validators');

const router = express.Router();

// List cameras with GIS metadata. Filterable by status, department.
router.get('/', authorize(['admin', 'operator', 'readonly']), async (req, res) => {
  try {
    const { status, department } = req.query;
    let q = `SELECT id, department, ST_AsGeoJSON(location)::json as location, status, vendor, stream_health, onboarded_at, updated_at FROM cameras WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (status) {
      q += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (department) {
      q += ` AND department = $${idx++}`;
      params.push(department);
    }

    q += ' ORDER BY onboarded_at DESC';

    const result = await query(q, params);
    res.json(result.rows);
  } catch (err) {
    console.error('List cameras error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Single camera with latest heartbeat
router.get('/:id', authorize(['admin', 'operator', 'readonly']), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, department, ST_AsGeoJSON(location)::json as location, status, vendor, stream_health, onboarded_at, updated_at
       FROM cameras WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    const camera = result.rows[0];

    // Latest heartbeat
    const hbResult = await query(
      'SELECT id, status, detail, reported_at FROM camera_heartbeats WHERE camera_id = $1 ORDER BY reported_at DESC LIMIT 1',
      [req.params.id]
    );
    camera.latest_heartbeat = hbResult.rows[0] || null;

    res.json(camera);
  } catch (err) {
    console.error('Get camera error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Onboard new camera (admin only)
router.post('/', authorize(['admin']), async (req, res) => {
  const { id, department, lon, lat, vendor } = req.body;
  if (!id || !department || lon === undefined || lat === undefined) {
    return res.status(400).json({ error: 'Missing required fields: id, department, lon, lat' });
  }

  // Validate camera ID format against DB constraint: ^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid camera id format. Must match pattern: starts with alphanumeric, 2-64 chars, allows . _ : -' });
  }

  // Validate coordinates
  const longitude = parseFloat(lon);
  const latitude = parseFloat(lat);
  if (isNaN(longitude) || isNaN(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return res.status(400).json({ error: 'Invalid coordinates. lon must be -180..180, lat must be -90..90' });
  }

  try {
    const result = await query(
      `INSERT INTO cameras (id, department, location, status, vendor, stream_health)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 'live', $5, 'ok')
       RETURNING id, department, ST_AsGeoJSON(location)::json as location, status, vendor, stream_health, onboarded_at`,
      [id, department, longitude, latitude, vendor || 'unknown']
    );

    await logAction(req.user.id, req.user.role, 'onboard_camera', 'cameras', id, { department, vendor, lon: longitude, lat: latitude });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: `Camera ${id} already exists` });
    }
    console.error('Onboard camera error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update camera status (admin only). Never DELETE — use status=deregistered.
router.patch('/:id', authorize(['admin']), async (req, res) => {
  const { status, stream_health } = req.body;

  if (!status && !stream_health) {
    return res.status(400).json({ error: 'Provide at least one field to update: status, stream_health' });
  }

  const validStatuses = ['live', 'offline', 'deregistered'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const setClauses = [];
    const params = [];
    let idx = 1;

    if (status) {
      setClauses.push(`status = $${idx++}`);
      params.push(status);
    }
    if (stream_health) {
      setClauses.push(`stream_health = $${idx++}`);
      params.push(stream_health);
    }

    params.push(req.params.id);

    const result = await query(
      `UPDATE cameras SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, status, stream_health, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    await logAction(req.user.id, req.user.role, 'update_camera', 'cameras', req.params.id, { status, stream_health });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update camera error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
