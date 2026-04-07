const express = require('express');
const livekitController = require('../controllers/livekit.controller');
const router = express.Router();

router.post('/token', livekitController.getToken);

module.exports = router;
