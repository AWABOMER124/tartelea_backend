const AudioRoom = require('../models/AudioRoom');
const { success } = require('../utils/response');
 codex/assess-registration-and-login-issues-1jnr5s
const livekitService = require('../services/livekit.service');

 codex/assess-registration-and-login-issues-v0dk1t
const livekitService = require('../services/livekit.service');
 main
 main

class AudioRoomController {
  static async create(req, res, next) {
    try {
      const room = await AudioRoom.create({
        title: req.body.title,
        description: req.body.description,
        hostId: req.user.id,
      });

      return success(res, { room }, 'تم إنشاء الغرفة الصوتية بنجاح', 201);
    } catch (err) {
      next(err);
    }
  }

  static async listLive(req, res, next) {
    try {
      const rooms = await AudioRoom.findLive();
      return success(res, { rooms }, 'تم جلب الغرف المباشرة');
    } catch (err) {
      next(err);
    }
  }

  static async join(req, res, next) {
    try {
      const room = await AudioRoom.findById(req.params.id);
      if (!room) {
        return res.status(404).json({ success: false, message: 'الغرفة غير موجودة' });
      }

      const updatedRoom = await AudioRoom.join({
        roomId: req.params.id,
        userId: req.user.id,
        role: req.body.role || 'listener',
      });

      return success(res, { room: updatedRoom }, 'تم الانضمام إلى الغرفة');
    } catch (err) {
      next(err);
    }
  }
 codex/assess-registration-and-login-issues-1jnr5s

 codex/assess-registration-and-login-issues-v0dk1t
 main

  static async leave(req, res, next) {
    try {
      const room = await AudioRoom.findById(req.params.id);
      if (!room) {
        return res.status(404).json({ success: false, message: 'الغرفة غير موجودة' });
      }

      const updatedRoom = await AudioRoom.leave({
        roomId: req.params.id,
        userId: req.user.id,
      });

      return success(res, { room: updatedRoom }, 'تمت مغادرة الغرفة');
    } catch (err) {
      next(err);
    }
  }

  static async roomToken(req, res, next) {
    try {
      const room = await AudioRoom.findById(req.params.id);
      if (!room) {
        return res.status(404).json({ success: false, message: 'الغرفة غير موجودة' });
      }

      const role = await AudioRoom.getParticipantRole({
        roomId: req.params.id,
        userId: req.user.id,
      });

      const effectiveRole = role || 'listener';
      const canPublish = ['speaker', 'moderator', 'host'].includes(effectiveRole);
      const token = await livekitService.generateToken({
        roomName: req.params.id,
        identity: req.user.id,
        canPublish,
        canSubscribe: true,
        metadata: { role: effectiveRole, roomId: req.params.id },
      });

      return success(res, { token, role: effectiveRole }, 'تم إصدار توكن الغرفة');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AudioRoomController;
 codex/assess-registration-and-login-issues-1jnr5s


}

module.exports = AudioRoomController;

 main
 main
