const express = require('express');
const { pool } = require('../db');
const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const postRoutes = require('./post.routes');
const workshopRoutes = require('./workshop.routes');
const subscriptionRoutes = require('./subscription.routes');
const entitlementRoutes = require('./entitlement.routes');
const planRoutes = require('./plan.routes');
const contentRoutes = require('./content.routes');
const mediaRoutes = require('./media.routes');
const livekitRoutes = require('./livekit.routes');
const audioRoomRoutes = require('./audio-room.routes');
const adminRoutes = require('./admin.routes');
const communityRoutes = require('./community.routes');
const communityAdminRoutes = require('./community-admin.routes');
const sessionRoutes = require('./session.routes');
const compatRoutes = require('./compat.routes');

const router = express.Router();

// Health Check
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'UP', 
    timestamp: new Date(),
    service: 'tartelea-backend',
    version: '1.0.0'
  });
});

// Readiness Check (dependency-aware)
// - 200 when DB is reachable
// - 503 when DB is down (service should be removed from load balancer)
router.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({
      success: true,
      status: 'READY',
      timestamp: new Date(),
      service: 'tartelea-backend',
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      status: 'NOT_READY',
      reason: 'DB_UNAVAILABLE',
      message: err?.message || 'Database is unavailable',
      timestamp: new Date(),
      service: 'tartelea-backend',
    });
  }
});

router.use('/auth', authRoutes);
router.use('/profiles', profileRoutes);
router.use('/posts', postRoutes);
router.use('/workshops', workshopRoutes);
router.use('/plans', planRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/entitlements', entitlementRoutes);
router.use('/contents', contentRoutes);
router.use('/media', mediaRoutes);
router.use('/livekit', livekitRoutes);
router.use('/audio-rooms', audioRoomRoutes);
router.use('/admin', adminRoutes);
router.use('/community', communityRoutes);
router.use('/admin/community', communityAdminRoutes);
router.use('/sessions', sessionRoutes);
router.use('/compat', compatRoutes);

module.exports = router;
