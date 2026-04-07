const express = require('express');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./utils/logger');
const env = require('./config/env');

const app = express();

// 1. MUST BE FIRST: Global CORS
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept']
}));

// --- Monitoring Middleware (Debug Only) ---
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // relaxed for production mobile users
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1', limiter);

// Log requests in development
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Global Middlewares
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
const uploadsPath = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Routes
const routes = require('./routes');
app.use('/api/v1', routes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
