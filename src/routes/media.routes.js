const express = require('express');
const multer = require('multer');
const path = require('path');
const { authenticateUser } = require('../middlewares/auth');
const { success, error } = require('../utils/response');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp3|mp4|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only images, audios, videos, and pdfs are allowed!'));
  }
});

router.post('/upload', authenticateUser, upload.single('file'), (req, res) => {
  if (!req.file) return error(res, 'No file uploaded', 400);
  
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  return success(res, { url: fileUrl, filename: req.file.filename });
});

module.exports = router;
