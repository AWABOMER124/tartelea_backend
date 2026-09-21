const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { authenticateUser } = require('../middlewares/auth');
const { success, error } = require('../utils/response');

const router = express.Router();

const ALLOWED_MIME_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['audio/mpeg', '.mp3'],
  ['video/mp4', '.mp4'],
  ['application/pdf', '.pdf'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve('uploads')),
  filename: (_req, file, cb) => {
    const extension = ALLOWED_MIME_TYPES.get(file.mimetype);
    cb(null, `${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(null, true);
    }

    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
  },
});

router.post('/upload', authenticateUser, upload.single('file'), (req, res) => {
  if (!req.file) return error(res, 'No file uploaded', 400, 'FILE_REQUIRED');

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  return success(res, {
    url: fileUrl,
    filename: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
});

module.exports = router;
