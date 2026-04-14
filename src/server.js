require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const cronJobs = require('./jobs/cron');
const logger = require('./utils/logger');

const { authLimiter, sensitiveLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const businessRoutes = require('./routes/business');
const publicRoutes = require('./routes/public');
const healthRoutes = require('./routes/health');
const uploadRoutes = require('./routes/uploads');

const app = express();
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);

// Static files
app.use('/static', express.static(path.join(__dirname, '../public')));

// CORS configuration
app.use(cors({
  origin: [
    'https://rewple.com',
    'https://www.rewple.com',
    'https://rewple.in',
    'https://www.rewple.in',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Apply rate limiting to sensitive routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', sensitiveLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/internal/system/admin', adminRoutes); // Protected/Hidden Admin Route
app.use('/api/business', businessRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/uploads', uploadRoutes);

// Error handling
app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Backend API started`);
  logger.info(`Server running at http://localhost:${PORT}`);
  logger.info(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);

  cronJobs.startAll();
  logger.info('Cron jobs initialized');
});

module.exports = app;
