const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getClient } = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateAlertHash } = require('../services/alertHashService');
const { logAction } = require('../services/auditService');

const router = express.Router();

// Detection ingestion — any authenticated user/service can post.
// The ANPR service authenticates with a regular JWT (operator-level or dedicated service account).
router.post('/', authenticate, async (req, res) => {
  const { idempotency_key, camera_id, timestamp, plate_text_raw, plate_text_normalized, confidence, frame_ref } = req.body;

  // --- Input validation ---
  if (!idempotency_key || !camera_id || !timestamp || plate_text_raw === undefined ||
      plate_text_normalized === undefined || confidence === undefined) {
    return res.status(400).json({ error: 'Missing required fields: idempotency_key, camera_id, timestamp, plate_text_raw, plate_text_normalized, confidence' });
  }

  if (typeof idempotency_key !== 'string' || idempotency_key.length < 8 || idempotency_key.length > 128) {
    return res.status(400).json({ error: 'idempotency_key must be 8–128 characters' });
  }

  const conf = parseFloat(confidence);
  if (isNaN(conf) || conf < 0 || conf > 1) {
    return res.status(400).json({ error: 'confidence must be a number between 0.0 and 1.0' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // --- Idempotency check ---
    const idempResult = await client.query(
      'SELECT detection_id FROM detection_idempotency WHERE idempotency_key = $1',
      [idempotency_key]
    );
    if (idempResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(200).json({ id: idempResult.rows[0].detection_id, deduplicated: true });
    }

    // --- Camera validation: must exist AND not be deregistered ---
    const cameraResult = await client.query(
      'SELECT id, status FROM cameras WHERE id = $1',
      [camera_id]
    );
    if (cameraResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Unknown camera_id: ${camera_id}. Camera must be registered before posting detections.` });
    }
    if (cameraResult.rows[0].status === 'deregistered') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Camera ${camera_id} is deregistered. Cannot accept detections for deregistered cameras.` });
    }

    const detectionId = uuidv4();
    const timestampReceived = new Date();
    let matched = false;
    let matchKind = 'none';
    let alertId = null;

    // --- Watchlist match at match-time (never cached) ---
    // High confidence (>= 0.7) → exact match only
    // Low confidence (< 0.7) → fuzzy match with Levenshtein distance <= 2
    let watchlistHit = null;
    if (conf >= 0.7) {
      const wlRes = await client.query(
        'SELECT id, plate_normalized FROM watchlist WHERE active = true AND plate_normalized = $1 LIMIT 1',
        [plate_text_normalized]
      );
      if (wlRes.rows.length > 0) {
        watchlistHit = wlRes.rows[0];
        matched = true;
        matchKind = 'exact';
      }
    } else {
      // Try fuzzy match with fuzzystrmatch extension; fall back to exact if extension unavailable
      try {
        const wlRes = await client.query(
          `SELECT id, plate_normalized, levenshtein(plate_normalized, $1) as dist
           FROM watchlist
           WHERE active = true AND levenshtein(plate_normalized, $1) <= 2
           ORDER BY dist ASC LIMIT 1`,
          [plate_text_normalized]
        );
        if (wlRes.rows.length > 0) {
          watchlistHit = wlRes.rows[0];
          matched = true;
          matchKind = wlRes.rows[0].dist === 0 ? 'exact' : 'fuzzy';
        }
      } catch (fuzzyErr) {
        // fuzzystrmatch not available — fall back to exact match
        const wlRes = await client.query(
          'SELECT id, plate_normalized FROM watchlist WHERE active = true AND plate_normalized = $1 LIMIT 1',
          [plate_text_normalized]
        );
        if (wlRes.rows.length > 0) {
          watchlistHit = wlRes.rows[0];
          matched = true;
          matchKind = 'exact';
        }
      }
    }

    // --- Insert detection ---
    await client.query(
      `INSERT INTO detections (id, timestamp_received, camera_id, timestamp_camera, plate_raw, plate_normalized, confidence, frame_ref, matched, match_kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [detectionId, timestampReceived, camera_id, timestamp, plate_text_raw, plate_text_normalized, conf, frame_ref || null, matched, matchKind]
    );

    // --- Create alert if watchlist match ---
    if (matched && watchlistHit) {
      alertId = uuidv4();
      const signedAt = new Date();
      const alertHash = generateAlertHash(frame_ref || '', watchlistHit.plate_normalized, timestamp, camera_id);

      await client.query(
        `INSERT INTO alerts (id, signed_at, detection_id, detection_ts, plate_matched, confidence, alert_hash, reviewed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
        [alertId, signedAt, detectionId, timestampReceived, watchlistHit.plate_normalized, conf, alertHash]
      );

      // Audit the alert creation
      await logAction(null, 'system', 'alert_created', 'alerts', alertId, {
        plate: watchlistHit.plate_normalized,
        camera_id,
        match_kind: matchKind,
        confidence: conf
      }, client);
    }

    // --- Insert idempotency record ---
    await client.query(
      'INSERT INTO detection_idempotency (idempotency_key, detection_id) VALUES ($1, $2)',
      [idempotency_key, detectionId]
    );

    await client.query('COMMIT');

    res.status(201).json({
      id: detectionId,
      timestamp_received: timestampReceived.toISOString(),
      matched,
      match_kind: matchKind,
      alert_id: alertId
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Detection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
