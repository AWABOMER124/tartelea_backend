const express = require('express');
const authRoutes = require('./auth.routes');
const profileRoutes = require('./profile.routes');
const postRoutes = require('./post.routes');
const workshopRoutes = require('./workshop.routes');
const subscriptionRoutes = require('./subscription.routes');
const contentRoutes = require('./content.routes');
const mediaRoutes = require('./media.routes');
const livekitRoutes = require('./livekit.routes');

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

router.use('/auth', authRoutes);
router.use('/profiles', profileRoutes);
router.use('/posts', postRoutes);
router.use('/workshops', workshopRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/contents', contentRoutes);
router.use('/media', mediaRoutes);
router.use('/livekit', livekitRoutes);

module.exports = router;
