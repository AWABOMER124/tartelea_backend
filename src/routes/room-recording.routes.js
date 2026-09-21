const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { authenticateUser } = require('../middlewares/auth');
const { success, error } = require('../utils/response');

const router = express.Router();
const uploadDir = path.resolve('uploads', 'room-recordings');
fs.mkdirSync(uploadDir, { recursive: true });

const MIME_EXTENSIONS = new Map([
  ['audio/webm', '.webm'],
  ['audio/ogg', '.ogg'],
  ['audio/mpeg', '.mp3'],
  ['audio/mp4', '.m4a'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${MIME_EXTENSIONS.get(file.mimetype) || '.bin'}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (MIME_EXTENSIONS.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
  },
});

function isPrivileged(user) {
  return Boolean(user?.roles?.some((role) => ['admin', 'moderator'].includes(role)));
}

async function canManageRoom(user, roomId) {
  const result = await db.query(
    'SELECT host_id, is_live FROM rooms WHERE id = $1 LIMIT 1',
    [roomId]
  );
  const room = result.rows[0];
  if (!room) return { allowed: false, room: null };
  return {
    allowed: room.host_id === user.id || isPrivileged(user),
    room,
  };
}

router.post('/upload', authenticateUser, upload.single('file'), async (req, res) => {
  const cleanupFile = async () => {
    if (!req.file?.path) return;
    await fs.promises.unlink(req.file.path).catch(() => {});
  };

  try {
    const roomId = req.body?.room_id;
    const durationSeconds = Number(req.body?.duration_seconds || 0);

    if (!roomId) {
      await cleanupFile();
      return error(res, 'room_id is required', 400, 'ROOM_ID_REQUIRED');
    }
    if (!req.file) {
      return error(res, 'Recording file is required', 400, 'FILE_REQUIRED');
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      await cleanupFile();
      return error(res, 'duration_seconds must be a positive number', 400, 'INVALID_DURATION');
    }

    const access = await canManageRoom(req.user, roomId);
    if (!access.room) {
      await cleanupFile();
      return error(res, 'Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (!access.allowed) {
      await cleanupFile();
      return error(res, 'Only the room host or a privileged moderator can upload recordings', 403, 'RECORDING_UPLOAD_DENIED');
    }

    const recordingUrl = `${req.protocol}://${req.get('host')}/uploads/room-recordings/${req.file.filename}`;
    const result = await db.query(
      `
        INSERT INTO room_recordings (
          room_id,
          recording_url,
          duration_seconds,
          file_size_bytes,
          is_available
        )
        VALUES ($1, $2, $3, $4, TRUE)
        RETURNING *
      `,
      [roomId, recordingUrl, Math.round(durationSeconds), req.file.size]
    );

    return success(res, result.rows[0], 'Recording uploaded', 201);
  } catch (uploadError) {
    await cleanupFile();
    return error(res, uploadError.message || 'Failed to upload recording', 500, 'RECORDING_UPLOAD_FAILED');
  }
});

router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const result = await db.query(
      `
        SELECT rr.*, r.host_id
        FROM room_recordings rr
        INNER JOIN rooms r ON r.id = rr.room_id
        WHERE rr.id = $1
        LIMIT 1
      `,
      [req.params.id]
    );
    const recording = result.rows[0];

    if (!recording) {
      return error(res, 'Recording not found', 404, 'RECORDING_NOT_FOUND');
    }
    if (recording.host_id !== req.user.id && !isPrivileged(req.user)) {
      return error(res, 'Access denied', 403, 'RECORDING_DELETE_DENIED');
    }

    await db.query('DELETE FROM room_recordings WHERE id = $1', [req.params.id]);

    if (recording.recording_url) {
      try {
        const url = new URL(recording.recording_url);
        const filename = path.basename(url.pathname);
        const filePath = path.join(uploadDir, filename);
        if (filePath.startsWith(uploadDir)) {
          await fs.promises.unlink(filePath).catch(() => {});
        }
      } catch {
        // Remote/legacy recording URLs are intentionally not deleted from external storage here.
      }
    }

    return success(res, { id: req.params.id }, 'Recording deleted');
  } catch (deleteError) {
    return error(res, deleteError.message || 'Failed to delete recording', 500, 'RECORDING_DELETE_FAILED');
  }
});

module.exports = router;
