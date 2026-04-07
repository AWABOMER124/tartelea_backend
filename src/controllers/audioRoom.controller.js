const AudioRoom = require('../models/AudioRoom');
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
}

module.exports = AudioRoomController;

