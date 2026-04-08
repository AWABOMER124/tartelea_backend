const AudioRoom = require('../models/AudioRoom');
const livekitService = require('../services/livekit.service');
const { success } = require('../utils/response');

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

      let role = await AudioRoom.getParticipantRole({
        roomId: req.params.id,
        userId: req.user.id,
      });

      if (!role) {
        const isHost = await AudioRoom.isHost({
          roomId: req.params.id,
          userId: req.user.id,
        });
        if (isHost) {
          role = 'host';
        }
      }

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
