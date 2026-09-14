const crypto = require('crypto');

const generateAlertHash = (frameRef, plateMatched, timestampCamera, cameraId) => {
  const secret = process.env.ALERT_HMAC_SECRET || 'default_secret';
  const data = `${frameRef}|${plateMatched}|${timestampCamera}|${cameraId}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};

const verifyAlertHash = (hash, frameRef, plateMatched, timestampCamera, cameraId) => {
  const expectedHash = generateAlertHash(frameRef, plateMatched, timestampCamera, cameraId);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
};

module.exports = {
  generateAlertHash,
  verifyAlertHash
};
