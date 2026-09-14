/**
 * Detection write queue — batches INSERT statements to avoid blocking
 * the ingestion hot path when DB writes are slow under load.
 *
 * For the 50-camera demo this is belt-and-suspenders; at 80k cameras
 * it would be replaced by a proper message queue (Redis Streams / RabbitMQ).
 * The detection route can call enqueueDetection() instead of inline INSERT
 * when operating in queued mode.
 */

const { getClient } = require('../db');

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 500;

let queue = [];
let flushTimer = null;

const startQueue = () => {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  console.log(`Detection queue started (batch=${BATCH_SIZE}, interval=${FLUSH_INTERVAL_MS}ms)`);
};

const stopQueue = () => {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  // Final flush
  if (queue.length > 0) flush();
};

const enqueueDetection = (detectionRow) => {
  queue.push(detectionRow);
  if (queue.length >= BATCH_SIZE) {
    flush();
  }
};

const flush = async () => {
  if (queue.length === 0) return;

  const batch = queue.splice(0, BATCH_SIZE);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Build a multi-row INSERT for efficiency
    const values = [];
    const params = [];
    let idx = 1;

    for (const row of batch) {
      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(
        row.id, row.timestamp_received, row.camera_id, row.timestamp_camera,
        row.plate_raw, row.plate_normalized, row.confidence, row.frame_ref,
        row.matched, row.match_kind
      );
    }

    await client.query(
      `INSERT INTO detections (id, timestamp_received, camera_id, timestamp_camera, plate_raw, plate_normalized, confidence, frame_ref, matched, match_kind)
       VALUES ${values.join(', ')}
       ON CONFLICT DO NOTHING`,
      params
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Detection queue flush error:', err);
    // Re-queue failed items for retry (put them back at the front)
    queue.unshift(...batch);
  } finally {
    client.release();
  }
};

module.exports = {
  enqueueDetection,
  startQueue,
  stopQueue,
  flush,
};
