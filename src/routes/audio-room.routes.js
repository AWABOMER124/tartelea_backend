const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middlewares/validate');
const { authenticateUser: auth } = require('../middlewares/auth');
const AudioRoomController = require('../controllers/audioRoom.controller');
const {
  createAudioRoomSchema,
  joinAudioRoomSchema,
  leaveAudioRoomSchema,
  roomTokenSchema,
} = require('../middlewares/validators/audio-room.validator');

const router = express.Router();
const roomTokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/live', AudioRoomController.listLive);
router.post('/', auth, validate(createAudioRoomSchema), AudioRoomController.create);
router.post('/:id/join', auth, validate(joinAudioRoomSchema), AudioRoomController.join);
router.post('/:id/leave', auth, validate(leaveAudioRoomSchema), AudioRoomController.leave);
router.post('/:id/token', auth, roomTokenLimiter, validate(roomTokenSchema), AudioRoomController.roomToken);

module.exports = router;
