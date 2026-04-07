const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '783558704365-rh09e2h61ivrd7s1e78c8ouheaqbiukg.apps.googleusercontent.com');
const app = express();
const port = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Media Storage Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Database Connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// --- Health Check ---
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// --- Media Upload ---
app.post('/api/media/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename });
});

// --- Authentication ---
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, full_name } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create User record
    const userResult = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, hashedPassword]
    );
    const userId = userResult.rows[0].id;

    // Create Profile record
    const profileResult = await client.query(
      'INSERT INTO profiles (id, email, full_name, country) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, email, full_name, req.body.country || null]
    );

    // Create Role record
    await client.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [userId, 'student']
    );
    
    await client.query('COMMIT');
    
    const user = { ...profileResult.rows[0], roles: ['student'] };
    const token = jwt.sign({ id: userId, email }, process.env.JWT_SECRET);
    res.json({ user, token });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT u.id, u.password_hash, p.*, array_agg(ur.role) as roles 
       FROM users u 
       JOIN profiles p ON u.id = p.id 
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       WHERE u.email = $1
       GROUP BY u.id, p.id`,
      [email]
    );
    
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) return res.status(401).json({ error: 'Invalid password' });
    
    // Remove sensitive data
    delete user.password_hash;
    
    const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET);
    res.json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'ID Token is required' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID || '783558704365-rh09e2h61ivrd7s1e78c8ouheaqbiukg.apps.googleusercontent.com',
    });
    
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // Check if user exists
      let result = await dbClient.query(
        `SELECT u.id, p.*, array_agg(ur.role) as roles 
         FROM users u 
         JOIN profiles p ON u.id = p.id 
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         WHERE u.email = $1
         GROUP BY u.id, p.id`,
        [email]
      );

      let user;
      if (result.rows.length === 0) {
        // Create new user for Google login
        const userResult = await dbClient.query(
          'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
          [email, 'GOOGLE_AUTH_EXTERNAL_' + googleId]
        );
        const userId = userResult.rows[0].id;

        const profileResult = await dbClient.query(
          'INSERT INTO profiles (id, email, full_name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *',
          [userId, email, name, picture]
        );

        await dbClient.query(
          'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
          [userId, 'student']
        );

        user = { ...profileResult.rows[0], roles: ['student'] };
      } else {
        user = result.rows[0];
      }

      await dbClient.query('COMMIT');
      
      const token = jwt.sign({ id: user.id, email }, process.env.JWT_SECRET);
      res.json({ user, token });

    } catch (err) {
      if (dbClient) await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      if (dbClient) dbClient.release();
    }

  } catch (err) {
    res.status(401).json({ error: 'Auth failed: ' + err.message });
  }
});

// --- Profiles ---
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, array_agg(ur.role) as roles 
       FROM profiles p 
       LEFT JOIN user_roles ur ON p.id = ur.user_id 
       WHERE p.id = $1
       GROUP BY p.id`, 
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/profiles/:id', async (req, res) => {
  const { full_name, bio, specialties, services, facebook_url, tiktok_url, instagram_url, country } = req.body;
  try {
    const result = await pool.query(
      `UPDATE profiles SET 
        full_name = COALESCE($1, full_name),
        bio = COALESCE($2, bio),
        specialties = COALESCE($3, specialties),
        services = COALESCE($4, services),
        facebook_url = COALESCE($5, facebook_url),
        tiktok_url = COALESCE($6, tiktok_url),
        instagram_url = COALESCE($7, instagram_url),
        country = COALESCE($8, country)
      WHERE id = $9 RETURNING *`,
      [full_name, bio, specialties, services, facebook_url, tiktok_url, instagram_url, country, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Posts ---
app.get('/api/posts', async (req, res) => {
  try {
    const result = await pool.query('SELECT p.*, pr.full_name as author_name FROM posts p LEFT JOIN profiles pr ON p.author_id = pr.id ORDER BY p.created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts', authenticateToken, async (req, res) => {
  const { title, body, category, image_url } = req.body;
  const author_id = req.user.id;
  try {
    const result = await pool.query(
      'INSERT INTO posts (author_id, title, body, category, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [author_id, title, body, category || 'general', image_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1 RETURNING likes_count',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/comment', authenticateToken, async (req, res) => {
  const { content } = req.body;
  const author_id = req.user.id;
  try {
    const result = await pool.query(
      'INSERT INTO comments (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, author_id, content]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT c.*, pr.full_name as author_name FROM comments c JOIN profiles pr ON c.author_id = pr.id WHERE c.post_id = $1 ORDER BY c.created_at ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Workshops ---
app.get('/api/workshops', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM workshops ORDER BY scheduled_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Subscriptions ---
app.get('/api/subscriptions/:userId', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [req.params.userId]);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Content ---
app.get('/api/contents', async (req, res) => {
  const { category, type } = req.query;
  try {
    let query = 'SELECT * FROM contents';
    const params = [];
    
    if (category || type) {
      query += ' WHERE';
      if (category) {
        params.push(category);
        query += ` category = $${params.length}`;
      }
      if (type) {
        if (params.length > 0) query += ' AND';
        params.push(type);
        query += ` type = $${params.length}`;
      }
    }
    
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contents/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Backend API running at http://localhost:${port}`);
});
