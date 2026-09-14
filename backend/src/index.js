const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const authRoutes = require('./routes/auth');
const detectionsRoutes = require('./routes/detections');
const alertsRoutes = require('./routes/alerts');
const camerasRoutes = require('./routes/cameras');
const watchlistRoutes = require('./routes/watchlist');
const auditLogRoutes = require('./routes/auditLog');
const heartbeatsRoutes = require('./routes/heartbeats');
const streamRoutes = require('./routes/stream');

const app = express();

app.use(helmet({
  contentSecurityPolicy: true,
  frameguard: { action: 'deny' },
  noSniff: true
}));

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(compression());

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.use('/enc.key', (req, res) => res.redirect('/api/v1/stream/enc.key'));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/detections', detectionsRoutes);
app.use('/api/v1/alerts', alertsRoutes);
app.use('/api/v1/cameras', camerasRoutes);
app.use('/api/v1/watchlist', watchlistRoutes);
app.use('/api/v1/audit-log', auditLogRoutes);
app.use('/api/v1/heartbeats', heartbeatsRoutes);
app.use('/api/v1/stream', streamRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (process.env.NODE_ENV === 'development') {
    res.status(500).json({ error: err.message, stack: err.stack });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.BACKEND_PORT || 4000;
app.listen(PORT, () => {
  console.log(`Sentinel backend API running on port ${PORT}`);
});
