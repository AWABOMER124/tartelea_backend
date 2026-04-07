const express = require('express');
const validate = require('../middlewares/validate');
const { authenticateUser: auth } = require('../middlewares/auth');
const AudioRoomController = require('../controllers/audioRoom.controller');
const { createAudioRoomSchema, joinAudioRoomSchema } = require('../middlewares/validators/audio-room.validator');

const router = express.Router();

router.get('/live', AudioRoomController.listLive);
router.post('/', auth, validate(createAudioRoomSchema), AudioRoomController.create);
router.post('/:id/join', auth, validate(joinAudioRoomSchema), AudioRoomController.join);

module.exports = router;

