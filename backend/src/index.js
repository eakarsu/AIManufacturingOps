const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const http = require('http');
const NodeCache = require('node-cache');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require('./db');
const initDatabase = require('./initDb');
const openRouterService = require('./services/openRouterService');
const { sendPasswordReset } = require('./services/emailService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.BACKEND_PORT || 4103;

// In-memory cache for dashboard stats (60s TTL)
const statsCache = new NodeCache({ stdTTL: 60 });

// =====================
// SECURITY MIDDLEWARE
// =====================
app.use(helmet());
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:4001'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

// Auth rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many auth attempts, please try again later.' }
});

// AI-specific rate limiter (20 requests per hour)
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'AI rate limit exceeded. Max 20 requests per hour.' }
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
// Apply AI rate limiter to all AI-intensive endpoints
app.use('/api/equipment/:id/predict', aiLimiter);
app.use('/api/routes/:id/optimize', aiLimiter);
app.use('/api/safety/:id/predict', aiLimiter);
app.use('/api/assembly/:id/optimize', aiLimiter);
app.use('/api/supply-chain/:id/analyze', aiLimiter);
app.use('/api/safety/cluster-analysis', aiLimiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// File upload config
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|csv/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/api/health') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Validation helper
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Audit logging helper
const logAudit = async (userId, userEmail, action, entityType, entityId, details, ipAddress) => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details, ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, userEmail, action, entityType, entityId, details, ipAddress]
    );
  } catch (e) { console.error('Audit log error:', e.message); }
};

// Initialize database on startup
initDatabase().catch(console.error);

// =====================
// HEALTH CHECK
// =====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// =====================
// AUTH ROUTES
// =====================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );
    await logAudit(user.id, user.email, 'LOGIN', 'user', user.id, 'User logged in', req.ip);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 1 }),
  validate,
  async (req, res) => {
    try {
      const { email, password, name } = req.body;
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });
      const hashedPassword = await bcrypt.hash(password, 10);
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const result = await pool.query(
        'INSERT INTO users (email, password, name, role, verification_token) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, role',
        [email, hashedPassword, name, 'user', verificationToken]
      );
      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '24h' }
      );
      await logAudit(user.id, user.email, 'REGISTER', 'user', user.id, 'New user registered', req.ip);
      res.status(201).json({ token, user });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

app.post('/api/auth/forgot-password',
  body('email').isEmail().normalizeEmail(),
  validate,
  async (req, res) => {
    try {
      const { email } = req.body;
      const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (user.rows.length === 0) return res.json({ message: 'If email exists, reset link sent' });
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour
      await pool.query(
        'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1,$2,$3)',
        [user.rows[0].id, token, expiresAt]
      );
      // Send password reset email
      console.log(`Password reset token for ${email}: ${token}`);
      try { await sendPasswordReset(email, token); } catch (e) { console.error('Email send failed:', e.message); }
      res.json({ message: 'If email exists, reset link sent', token }); // token returned for demo
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

app.post('/api/auth/reset-password',
  body('token').notEmpty(),
  body('password').isLength({ min: 6 }),
  validate,
  async (req, res) => {
    try {
      const { token, password } = req.body;
      const result = await pool.query(
        'SELECT * FROM password_resets WHERE token = $1 AND used = false AND expires_at > NOW()',
        [token]
      );
      if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token' });
      const reset = result.rows[0];
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, reset.user_id]);
      await pool.query('UPDATE password_resets SET used = true WHERE id = $1', [reset.id]);
      await logAudit(reset.user_id, null, 'PASSWORD_RESET', 'user', reset.user_id, 'Password reset', req.ip);
      res.json({ message: 'Password reset successful' });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

app.post('/api/auth/verify-email/:token', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE users SET email_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING id, email',
      [req.params.token]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Invalid verification token' });
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/refresh', authenticateToken, (req, res) => {
  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, role: req.user.role, name: req.user.name },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '24h' }
  );
  res.json({ token });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, phone, department, avatar_url, email_verified, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/default-credentials', (req, res) => {
  res.json({
    email: process.env.DEFAULT_EMAIL || 'admin@manufacturing.com',
    password: process.env.DEFAULT_PASSWORD || 'admin123'
  });
});

// =====================
// PROFILE & SETTINGS
// =====================
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, department } = req.body;
    const result = await pool.query(
      'UPDATE users SET name=$1, phone=$2, department=$3 WHERE id=$4 RETURNING id, email, name, role, phone, department, avatar_url',
      [name, phone, department, req.user.id]
    );
    await logAudit(req.user.id, req.user.email, 'UPDATE_PROFILE', 'user', req.user.id, 'Profile updated', req.ip);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/auth/change-password', authenticateToken,
  body('oldPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  validate,
  async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const user = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
      const valid = await bcrypt.compare(oldPassword, user.rows[0].password);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);
      await logAudit(req.user.id, req.user.email, 'CHANGE_PASSWORD', 'user', req.user.id, 'Password changed', req.ip);
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
);

app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    let result = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      result = await pool.query(
        'INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *', [req.user.id]
      );
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/settings', authenticateToken, async (req, res) => {
  try {
    const { theme, email_notifications, push_notifications, language } = req.body;
    const result = await pool.query(
      `INSERT INTO user_settings (user_id, theme, email_notifications, push_notifications, language)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET theme=$2, email_notifications=$3, push_notifications=$4, language=$5, updated_at=CURRENT_TIMESTAMP
       RETURNING *`,
      [req.user.id, theme || 'dark', email_notifications !== false, push_notifications === true, language || 'en']
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// ADMIN ROUTES
// =====================
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT id, email, name, role, department, email_verified, created_at FROM users';
    const params = [];
    if (search) {
      queryStr += ' WHERE name ILIKE $1 OR email ILIKE $1';
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'operator', 'manager', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role',
      [role, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await logAudit(req.user.id, req.user.email, 'CHANGE_ROLE', 'user', parseInt(req.params.id),
      `Role changed to ${role}`, req.ip);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id, email', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await logAudit(req.user.id, req.user.email, 'DELETE_USER', 'user', parseInt(req.params.id),
      `Deleted user ${result.rows[0].email}`, req.ip);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// NOTIFICATIONS ROUTES
// =====================
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM notifications WHERE user_id = $1';
    const params = [req.user.id];
    if (search) {
      queryStr += ` AND (title ILIKE $${params.length + 1} OR message ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM notifications WHERE user_id = $1', [req.user.id]);
    const unreadResult = await pool.query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false', [req.user.id]);
    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      unread: parseInt(unreadResult.rows[0].count),
      page: parseInt(page), limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/notifications/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { title, message, type, severity, related_entity, related_id, user_id } = req.body;
    const targetUserId = user_id || req.user.id;
    const result = await pool.query(
      'INSERT INTO notifications (title, message, type, severity, related_entity, related_id, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [title, message, type || 'info', severity || 'low', related_entity, related_id, targetUserId]
    );
    // Broadcast via WebSocket
    broadcastToUser(targetUserId, { type: 'notification', data: result.rows[0] });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// AUDIT LOG ROUTES
// =====================
app.get('/api/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 20, action } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM audit_logs';
    const params = [];
    const conditions = [];
    if (search) {
      conditions.push(`(user_email ILIKE $${params.length + 1} OR details ILIKE $${params.length + 1} OR action ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    if (action) {
      conditions.push(`action = $${params.length + 1}`);
      params.push(action);
    }
    if (conditions.length) queryStr += ' WHERE ' + conditions.join(' AND ');
    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countQuery = conditions.length
      ? `SELECT COUNT(*) FROM audit_logs WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM audit_logs';
    const countResult = await pool.query(countQuery, params.slice(0, params.length - 2));
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/audit-logs/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Audit log not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// SHIFT MANAGEMENT ROUTES
// =====================
app.get('/api/shifts', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM shifts';
    const params = [];
    if (search) {
      queryStr += ' WHERE name ILIKE $1 OR supervisor ILIKE $1 OR department ILIKE $1';
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM shifts');
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/shifts/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shifts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/shifts', authenticateToken, async (req, res) => {
  try {
    const { name, supervisor, start_time, end_time, department, workers_assigned, status, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO shifts (name, supervisor, start_time, end_time, department, workers_assigned, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, supervisor, start_time, end_time, department, workers_assigned || 0, status || 'scheduled', notes]
    );
    await logAudit(req.user.id, req.user.email, 'CREATE', 'shift', result.rows[0].id, `Created shift: ${name}`, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/shifts/:id', authenticateToken, async (req, res) => {
  try {
    const { name, supervisor, start_time, end_time, department, workers_assigned, status, notes } = req.body;
    const result = await pool.query(
      `UPDATE shifts SET name=$1, supervisor=$2, start_time=$3, end_time=$4, department=$5,
       workers_assigned=$6, status=$7, notes=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$9 RETURNING *`,
      [name, supervisor, start_time, end_time, department, workers_assigned, status, notes, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    await logAudit(req.user.id, req.user.email, 'UPDATE', 'shift', parseInt(req.params.id), `Updated shift: ${name}`, req.ip);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/shifts/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM shifts WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    await logAudit(req.user.id, req.user.email, 'DELETE', 'shift', parseInt(req.params.id), `Deleted shift: ${result.rows[0].name}`, req.ip);
    res.json({ message: 'Shift deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// FEEDBACK ROUTES
// =====================
app.get('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM feedback';
    const params = [];
    if (search) {
      queryStr += ' WHERE subject ILIKE $1 OR message ILIKE $1';
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM feedback');
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/feedback/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM feedback WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Feedback not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const { type, subject, message, rating } = req.body;
    const result = await pool.query(
      'INSERT INTO feedback (user_id, user_email, type, subject, message, rating) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.id, req.user.email, type || 'general', subject, message, rating]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/feedback/:id', authenticateToken, async (req, res) => {
  try {
    const { type, subject, message, rating, status, admin_response } = req.body;
    const result = await pool.query(
      `UPDATE feedback SET type=$1, subject=$2, message=$3, rating=$4, status=$5, admin_response=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$7 RETURNING *`,
      [type, subject, message, rating, status, admin_response, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Feedback not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/feedback/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM feedback WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Feedback not found' });
    res.json({ message: 'Feedback deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// FILE UPLOAD ROUTES
// =====================
app.post('/api/uploads', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { entity_type, entity_id } = req.body;
    const result = await pool.query(
      'INSERT INTO file_uploads (filename, original_name, mime_type, size, entity_type, entity_id, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, entity_type, entity_id, req.user.id]
    );
    await logAudit(req.user.id, req.user.email, 'UPLOAD', 'file', result.rows[0].id, `Uploaded: ${req.file.originalname}`, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/uploads/:entity_type/:entity_id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM file_uploads WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC',
      [req.params.entity_type, req.params.entity_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/uploads/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM file_uploads WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'File not found' });
    res.json({ message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// EQUIPMENT ROUTES (Predictive Maintenance)
// =====================
app.get('/api/equipment', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM equipment';
    const params = [];
    if (search) {
      queryStr += ' WHERE name ILIKE $1 OR type ILIKE $1 OR location ILIKE $1';
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY failure_probability DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM equipment');
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/equipment/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM equipment WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/equipment', authenticateToken, async (req, res) => {
  try {
    const { name, type, location, status, last_maintenance, next_maintenance, temperature, vibration, runtime_hours, failure_probability } = req.body;
    const result = await pool.query(
      `INSERT INTO equipment (name, type, location, status, last_maintenance, next_maintenance, temperature, vibration, runtime_hours, failure_probability)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [name, type, location, status || 'operational', last_maintenance, next_maintenance, temperature, vibration, runtime_hours, failure_probability || 0]
    );
    await logAudit(req.user.id, req.user.email, 'CREATE', 'equipment', result.rows[0].id, `Created: ${name}`, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/equipment/:id', authenticateToken, async (req, res) => {
  try {
    const { name, type, location, status, last_maintenance, next_maintenance, temperature, vibration, runtime_hours, failure_probability } = req.body;
    const result = await pool.query(
      `UPDATE equipment SET name=$1, type=$2, location=$3, status=$4, last_maintenance=$5, next_maintenance=$6,
       temperature=$7, vibration=$8, runtime_hours=$9, failure_probability=$10, updated_at=CURRENT_TIMESTAMP
       WHERE id=$11 RETURNING *`,
      [name, type, location, status, last_maintenance, next_maintenance, temperature, vibration, runtime_hours, failure_probability, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
    await logAudit(req.user.id, req.user.email, 'UPDATE', 'equipment', parseInt(req.params.id), `Updated: ${name}`, req.ip);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/equipment/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM equipment WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
    await logAudit(req.user.id, req.user.email, 'DELETE', 'equipment', parseInt(req.params.id), `Deleted: ${result.rows[0].name}`, req.ip);
    res.json({ message: 'Equipment deleted', equipment: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// NOTE: Full equipment predict with WebSocket alerts is defined in the new endpoints section below.

// =====================
// ROUTES (Route Optimizer)
// =====================
app.get('/api/routes', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM routes';
    const params = [];
    if (search) {
      queryStr += ' WHERE name ILIKE $1 OR origin ILIKE $1 OR destination ILIKE $1';
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY priority DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM routes');
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/routes/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM routes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/routes', authenticateToken, async (req, res) => {
  try {
    const { name, origin, destination, distance, estimated_time, vehicle_type, priority, status, waypoints } = req.body;
    const result = await pool.query(
      `INSERT INTO routes (name, origin, destination, distance, estimated_time, vehicle_type, priority, status, waypoints)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, origin, destination, distance, estimated_time, vehicle_type, priority || 'normal', status || 'pending', waypoints]
    );
    await logAudit(req.user.id, req.user.email, 'CREATE', 'route', result.rows[0].id, `Created: ${name}`, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/routes/:id', authenticateToken, async (req, res) => {
  try {
    const { name, origin, destination, distance, estimated_time, vehicle_type, priority, status, waypoints } = req.body;
    const result = await pool.query(
      `UPDATE routes SET name=$1, origin=$2, destination=$3, distance=$4, estimated_time=$5,
       vehicle_type=$6, priority=$7, status=$8, waypoints=$9, updated_at=CURRENT_TIMESTAMP
       WHERE id=$10 RETURNING *`,
      [name, origin, destination, distance, estimated_time, vehicle_type, priority, status, waypoints, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    await logAudit(req.user.id, req.user.email, 'UPDATE', 'route', parseInt(req.params.id), `Updated: ${name}`, req.ip);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/routes/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM routes WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    await logAudit(req.user.id, req.user.email, 'DELETE', 'route', parseInt(req.params.id), `Deleted: ${result.rows[0].name}`, req.ip);
    res.json({ message: 'Route deleted', route: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/routes/:id/optimize', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM routes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Route not found' });
    const route = result.rows[0];
    const optimization = await openRouterService.optimizeRoute(route);
    await pool.query('UPDATE routes SET ai_optimization = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [optimization.optimization, req.params.id]);
    res.json(optimization);
  } catch (error) {
    console.error('Optimization error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// SAFETY INCIDENTS ROUTES
// =====================
app.get('/api/safety', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM safety_incidents';
    const params = [];
    if (search) {
      queryStr += ' WHERE title ILIKE $1 OR description ILIKE $1 OR location ILIKE $1';
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY risk_score DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM safety_incidents');
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/safety/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM safety_incidents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Safety incident not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/safety', authenticateToken, async (req, res) => {
  try {
    const { title, description, location, severity, incident_type, reported_by, status, risk_score } = req.body;
    const result = await pool.query(
      `INSERT INTO safety_incidents (title, description, location, severity, incident_type, reported_by, status, risk_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, description, location, severity || 'low', incident_type, reported_by, status || 'open', risk_score || 0]
    );
    await logAudit(req.user.id, req.user.email, 'CREATE', 'safety', result.rows[0].id, `Created: ${title}`, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/safety/:id', authenticateToken, async (req, res) => {
  try {
    const { title, description, location, severity, incident_type, reported_by, status, risk_score } = req.body;
    const result = await pool.query(
      `UPDATE safety_incidents SET title=$1, description=$2, location=$3, severity=$4,
       incident_type=$5, reported_by=$6, status=$7, risk_score=$8, updated_at=CURRENT_TIMESTAMP
       WHERE id=$9 RETURNING *`,
      [title, description, location, severity, incident_type, reported_by, status, risk_score, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Safety incident not found' });
    await logAudit(req.user.id, req.user.email, 'UPDATE', 'safety', parseInt(req.params.id), `Updated: ${title}`, req.ip);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/safety/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM safety_incidents WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Safety incident not found' });
    await logAudit(req.user.id, req.user.email, 'DELETE', 'safety', parseInt(req.params.id), `Deleted: ${result.rows[0].title}`, req.ip);
    res.json({ message: 'Safety incident deleted', incident: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/safety/:id/predict', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM safety_incidents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Safety incident not found' });
    const incident = result.rows[0];
    const prediction = await openRouterService.predictSafetyRisk(incident);
    await pool.query('UPDATE safety_incidents SET ai_prediction = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [prediction.prediction, req.params.id]);
    res.json(prediction);
  } catch (error) {
    console.error('Safety prediction error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/safety/cluster-analysis — AI pattern recognition across incidents
app.post('/api/safety/cluster-analysis', authenticateToken, async (req, res) => {
  try {
    const incidentsResult = await pool.query(`
      SELECT location, incident_type, severity, COUNT(*) as count
      FROM safety_incidents
      WHERE created_at >= NOW() - INTERVAL '90 days'
      GROUP BY location, incident_type, severity
      ORDER BY count DESC
    `);
    const incidents = incidentsResult.rows;
    const systemPrompt = `You are a manufacturing safety analyst specializing in incident pattern recognition.
Analyze safety incident patterns and identify hotspots and trends.
Return ONLY valid JSON with this exact structure:
{ "patterns": [{"location": string, "incident_type": string, "count": number, "risk_level": string}], "hotspot_locations": [string], "recommendations": [string], "trend": "improving|stable|worsening" }`;
    const userPrompt = `Analyze these manufacturing safety incident patterns from the past 90 days:\n${JSON.stringify(incidents, null, 2)}\n\nReturn JSON analysis.`;

    const aiResult = await openRouterService.makeRequest(
      [{ role: 'user', content: userPrompt }],
      systemPrompt
    );
    const rawText = aiResult.choices[0].message.content;
    let parsed = null;
    try { parsed = JSON.parse(rawText); } catch (e) {
      const stripped = rawText.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      try { parsed = JSON.parse(stripped); } catch (e2) {
        const s = rawText.indexOf('{'); const e3 = rawText.lastIndexOf('}');
        if (s !== -1 && e3 !== -1) { try { parsed = JSON.parse(rawText.slice(s, e3 + 1)); } catch (e4) {} }
      }
    }
    res.json({ raw_incidents: incidents, analysis: parsed || rawText, model: aiResult.model });
  } catch (error) {
    console.error('Cluster analysis error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// ASSEMBLY LINES ROUTES
// =====================
app.get('/api/assembly', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM assembly_lines';
    const params = [];
    if (search) {
      queryStr += ' WHERE name ILIKE $1 OR product ILIKE $1 OR bottleneck ILIKE $1';
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY efficiency ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM assembly_lines');
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/assembly/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM assembly_lines WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assembly line not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/assembly', authenticateToken, async (req, res) => {
  try {
    const { name, product, capacity, current_output, efficiency, workers, stations, bottleneck, status } = req.body;
    const result = await pool.query(
      `INSERT INTO assembly_lines (name, product, capacity, current_output, efficiency, workers, stations, bottleneck, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, product, capacity, current_output, efficiency || 0, workers, stations, bottleneck, status || 'running']
    );
    await logAudit(req.user.id, req.user.email, 'CREATE', 'assembly', result.rows[0].id, `Created: ${name}`, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/assembly/:id', authenticateToken, async (req, res) => {
  try {
    const { name, product, capacity, current_output, efficiency, workers, stations, bottleneck, status } = req.body;
    const result = await pool.query(
      `UPDATE assembly_lines SET name=$1, product=$2, capacity=$3, current_output=$4,
       efficiency=$5, workers=$6, stations=$7, bottleneck=$8, status=$9, updated_at=CURRENT_TIMESTAMP
       WHERE id=$10 RETURNING *`,
      [name, product, capacity, current_output, efficiency, workers, stations, bottleneck, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assembly line not found' });
    await logAudit(req.user.id, req.user.email, 'UPDATE', 'assembly', parseInt(req.params.id), `Updated: ${name}`, req.ip);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/assembly/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM assembly_lines WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assembly line not found' });
    await logAudit(req.user.id, req.user.email, 'DELETE', 'assembly', parseInt(req.params.id), `Deleted: ${result.rows[0].name}`, req.ip);
    res.json({ message: 'Assembly line deleted', line: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/assembly/:id/optimize', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM assembly_lines WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assembly line not found' });
    const line = result.rows[0];
    const optimization = await openRouterService.optimizeAssemblyLine(line);
    await pool.query('UPDATE assembly_lines SET ai_optimization = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [optimization.optimization, req.params.id]);

    // Emit production:update WebSocket event when quality check reveals issues (efficiency < 80%)
    if (line.efficiency < 80) {
      broadcast({
        type: 'production:update',
        data: {
          event: 'quality_check_failed',
          line_id: line.id,
          line_name: line.name,
          product: line.product,
          efficiency: line.efficiency,
          bottleneck: line.bottleneck,
          message: `Quality check: ${line.name} running at ${line.efficiency}% efficiency — below 80% threshold`,
          optimization_preview: (optimization.optimization || '').substring(0, 200),
          timestamp: new Date().toISOString()
        }
      });
    }

    res.json(optimization);
  } catch (error) {
    console.error('Assembly optimization error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// SUPPLY CHAIN ROUTES
// =====================
app.get('/api/supply-chain', authenticateToken, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let queryStr = 'SELECT * FROM supply_chain';
    const params = [];
    if (search) {
      queryStr += ' WHERE item_name ILIKE $1 OR supplier ILIKE $1 OR tracking_number ILIKE $1';
      params.push(`%${search}%`);
    }
    queryStr += ` ORDER BY estimated_arrival ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await pool.query(queryStr, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM supply_chain');
    res.json({ data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/supply-chain/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM supply_chain WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supply chain item not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/supply-chain', authenticateToken, async (req, res) => {
  try {
    const { item_name, supplier, origin_location, current_location, destination, quantity, status, estimated_arrival, tracking_number } = req.body;
    const result = await pool.query(
      `INSERT INTO supply_chain (item_name, supplier, origin_location, current_location, destination, quantity, status, estimated_arrival, tracking_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [item_name, supplier, origin_location, current_location, destination, quantity, status || 'pending', estimated_arrival, tracking_number]
    );
    await logAudit(req.user.id, req.user.email, 'CREATE', 'supply_chain', result.rows[0].id, `Created: ${item_name}`, req.ip);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/supply-chain/:id', authenticateToken, async (req, res) => {
  try {
    const { item_name, supplier, origin_location, current_location, destination, quantity, status, estimated_arrival, tracking_number } = req.body;
    const result = await pool.query(
      `UPDATE supply_chain SET item_name=$1, supplier=$2, origin_location=$3, current_location=$4,
       destination=$5, quantity=$6, status=$7, estimated_arrival=$8, tracking_number=$9, updated_at=CURRENT_TIMESTAMP
       WHERE id=$10 RETURNING *`,
      [item_name, supplier, origin_location, current_location, destination, quantity, status, estimated_arrival, tracking_number, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supply chain item not found' });
    await logAudit(req.user.id, req.user.email, 'UPDATE', 'supply_chain', parseInt(req.params.id), `Updated: ${item_name}`, req.ip);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/supply-chain/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM supply_chain WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supply chain item not found' });
    await logAudit(req.user.id, req.user.email, 'DELETE', 'supply_chain', parseInt(req.params.id), `Deleted: ${result.rows[0].item_name}`, req.ip);
    res.json({ message: 'Supply chain item deleted', item: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/supply-chain/:id/analyze', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM supply_chain WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supply chain item not found' });
    const item = result.rows[0];
    const analysis = await openRouterService.analyzeSupplyChain(item);
    await pool.query('UPDATE supply_chain SET ai_analysis = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [analysis.analysis, req.params.id]);
    res.json(analysis);
  } catch (error) {
    console.error('Supply chain analysis error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// WEBSOCKET-CONNECTED AI ENDPOINTS
// =====================

// Equipment failure prediction — emits equipment:alert via WebSocket when risk is High/Critical
app.post('/api/equipment/:id/predict', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM equipment WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
    const equipment = result.rows[0];
    const prediction = await openRouterService.predictMaintenance(equipment);
    await pool.query('UPDATE equipment SET ai_prediction = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [prediction.analysis, req.params.id]);

    // Detect risk level from AI response and emit WebSocket alert
    const analysisText = prediction.analysis || '';
    const riskMatch = analysisText.match(/Risk[^:]*:\s*(Low|Medium|High|Critical)/i) ||
                      analysisText.match(/\b(Critical|High|Medium|Low)\b/i);
    const riskLevel = riskMatch ? riskMatch[1] : 'Unknown';

    if (riskLevel === 'High' || riskLevel === 'Critical') {
      const alertPayload = {
        type: 'equipment:alert',
        data: {
          equipment_id: equipment.id,
          equipment_name: equipment.name,
          location: equipment.location,
          risk_level: riskLevel,
          failure_probability: equipment.failure_probability,
          message: `${riskLevel} failure risk detected for ${equipment.name} at ${equipment.location}`,
          analysis_preview: analysisText.substring(0, 300),
          timestamp: new Date().toISOString()
        }
      };
      broadcast(alertPayload);

      // Also persist as a notification for all users
      await pool.query(
        'INSERT INTO notifications (title, message, type, severity, related_entity, related_id, user_id) SELECT $1,$2,$3,$4,$5,$6,id FROM users WHERE role = $7',
        [
          `${riskLevel} Equipment Alert: ${equipment.name}`,
          `AI predicts ${riskLevel} failure risk for ${equipment.name} (${equipment.location}). Failure probability: ${equipment.failure_probability}%.`,
          'alert',
          riskLevel.toLowerCase(),
          'equipment',
          equipment.id,
          'admin'
        ]
      );
    }

    res.json({ ...prediction, riskLevel, websocketAlertSent: riskLevel === 'High' || riskLevel === 'Critical' });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// CRON: PREDICT EQUIPMENT FAILURES
// =====================
// POST /api/cron/predict-failures
// Runs AI failure analysis on all equipment and sends alerts for high-risk items.
// Intended to be called by a scheduler (e.g., cron job or external trigger).
const aiCronLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10,
  message: { error: 'Cron rate limit exceeded.' }
});

app.post('/api/cron/predict-failures', authenticateToken, aiCronLimiter, async (req, res) => {
  try {
    const threshold = parseFloat(req.body.failure_threshold) || 30.0;
    const equipmentResult = await pool.query(
      'SELECT * FROM equipment WHERE failure_probability >= $1 OR status = $2 ORDER BY failure_probability DESC',
      [threshold, 'warning']
    );

    const equipment_list = equipmentResult.rows;
    if (equipment_list.length === 0) {
      return res.json({ message: 'No high-risk equipment found', threshold, processed: 0, alerts_sent: 0 });
    }

    const results = [];
    let alertsSent = 0;

    for (const equipment of equipment_list) {
      const prediction = await openRouterService.predictMaintenance(equipment);

      // Persist prediction
      await pool.query(
        'UPDATE equipment SET ai_prediction = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [prediction.analysis, equipment.id]
      );

      const analysisText = prediction.analysis || '';
      const riskMatch = analysisText.match(/Risk[^:]*:\s*(Low|Medium|High|Critical)/i) ||
                        analysisText.match(/\b(Critical|High|Medium|Low)\b/i);
      const riskLevel = riskMatch ? riskMatch[1] : 'Unknown';

      if (riskLevel === 'High' || riskLevel === 'Critical') {
        // Broadcast real-time alert
        broadcast({
          type: 'equipment:alert',
          data: {
            equipment_id: equipment.id,
            equipment_name: equipment.name,
            location: equipment.location,
            risk_level: riskLevel,
            failure_probability: equipment.failure_probability,
            message: `[CRON] ${riskLevel} failure risk: ${equipment.name}`,
            timestamp: new Date().toISOString()
          }
        });

        // Notify admin users
        await pool.query(
          'INSERT INTO notifications (title, message, type, severity, related_entity, related_id, user_id) SELECT $1,$2,$3,$4,$5,$6,id FROM users WHERE role = $7',
          [
            `[Cron] ${riskLevel} Failure Risk: ${equipment.name}`,
            `Scheduled failure scan: ${equipment.name} at ${equipment.location} has ${riskLevel} failure risk (probability: ${equipment.failure_probability}%).`,
            'alert',
            riskLevel.toLowerCase(),
            'equipment',
            equipment.id,
            'admin'
          ]
        );
        alertsSent++;
      }

      results.push({
        equipment_id: equipment.id,
        name: equipment.name,
        failure_probability: equipment.failure_probability,
        risk_level: riskLevel,
        alert_sent: riskLevel === 'High' || riskLevel === 'Critical'
      });
    }

    res.json({
      message: 'Equipment failure prediction scan complete',
      threshold,
      processed: equipment_list.length,
      alerts_sent: alertsSent,
      results
    });
  } catch (error) {
    console.error('Predict failures cron error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// QUALITY TRENDS
// =====================
// GET /api/quality/trends — defect rates by product/line/shift with AI commentary
app.get('/api/quality/trends', authenticateToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const windowDays = Math.min(parseInt(days) || 30, 365);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // Aggregate assembly line performance as a quality proxy
    const lineStats = await pool.query(`
      SELECT
        al.id,
        al.name AS line_name,
        al.product,
        al.capacity,
        al.current_output,
        al.efficiency,
        al.workers,
        al.stations,
        al.bottleneck,
        al.status,
        ROUND(100.0 - al.efficiency, 2) AS defect_rate_estimate,
        al.updated_at
      FROM assembly_lines al
      ORDER BY al.efficiency ASC
    `);

    // Aggregate shift data
    const shiftStats = await pool.query(`
      SELECT
        department,
        COUNT(*) AS total_shifts,
        AVG(workers_assigned) AS avg_workers,
        status
      FROM shifts
      GROUP BY department, status
      ORDER BY department
    `);

    // Build summary for AI
    const qualityData = {
      period_days: windowDays,
      assembly_lines: lineStats.rows.map(row => ({
        line: row.line_name,
        product: row.product,
        efficiency_pct: row.efficiency,
        defect_rate_estimate_pct: row.defect_rate_estimate,
        output_vs_capacity: `${row.current_output}/${row.capacity}`,
        bottleneck: row.bottleneck || 'None',
        status: row.status
      })),
      shift_summary: shiftStats.rows,
      worst_performing_lines: lineStats.rows
        .filter(r => r.efficiency < 80)
        .map(r => ({ line: r.line_name, product: r.product, efficiency: r.efficiency }))
    };

    const systemPrompt = `You are a manufacturing quality assurance AI. Analyze production quality trends and provide actionable insights.
    Format your response with sections: Quality Overview, Top Defect Risks, Line-Level Findings, Shift-Level Patterns, and Recommended Corrective Actions.`;

    const prompt = `Analyze these manufacturing quality trends and provide commentary:
    ${JSON.stringify(qualityData, null, 2)}`;

    let aiCommentary = null;
    let aiError = null;
    try {
      const aiResult = await openRouterService.makeRequest(
        [{ role: 'user', content: prompt }],
        systemPrompt
      );
      aiCommentary = aiResult.choices[0].message.content;
    } catch (aiErr) {
      aiError = 'AI commentary unavailable';
      console.error('Quality trends AI error:', aiErr.message);
    }

    res.json({
      period_days: windowDays,
      generated_at: new Date().toISOString(),
      assembly_line_stats: lineStats.rows,
      shift_stats: shiftStats.rows,
      summary: {
        total_lines: lineStats.rows.length,
        lines_below_80pct_efficiency: lineStats.rows.filter(r => r.efficiency < 80).length,
        avg_efficiency: lineStats.rows.length
          ? (lineStats.rows.reduce((s, r) => s + parseFloat(r.efficiency || 0), 0) / lineStats.rows.length).toFixed(2)
          : null
      },
      ai_commentary: aiCommentary,
      ai_error: aiError
    });
  } catch (error) {
    console.error('Quality trends error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// SUPPLIER PERFORMANCE SCORING
// =====================
// GET /api/suppliers/:id/score — on-time delivery rate, defect rate, AI vendor risk assessment
app.get('/api/suppliers/:id/score', authenticateToken, async (req, res) => {
  try {
    const supplierId = req.params.id;

    // Find all supply chain records for this supplier (by id or name)
    // Supports both numeric id and supplier name as the identifier
    let supplierQuery;
    let supplierItems;

    if (!isNaN(supplierId)) {
      supplierQuery = await pool.query('SELECT * FROM supply_chain WHERE id = $1', [supplierId]);
      if (supplierQuery.rows.length === 0) return res.status(404).json({ error: 'Supplier record not found' });
      const supplierName = supplierQuery.rows[0].supplier;
      supplierItems = await pool.query(
        'SELECT * FROM supply_chain WHERE supplier ILIKE $1 ORDER BY created_at DESC',
        [supplierName]
      );
    } else {
      // Treat as supplier name
      supplierItems = await pool.query(
        'SELECT * FROM supply_chain WHERE supplier ILIKE $1 ORDER BY created_at DESC',
        [`%${supplierId}%`]
      );
      if (supplierItems.rows.length === 0) return res.status(404).json({ error: 'No records found for this supplier' });
    }

    const items = supplierItems.rows;
    const supplierName = items[0].supplier;

    // Compute performance metrics
    const totalOrders = items.length;
    const deliveredOrders = items.filter(i => i.status === 'delivered').length;
    const inTransit = items.filter(i => i.status === 'in_transit').length;
    const inCustoms = items.filter(i => i.status === 'customs').length;
    const delayedOrders = items.filter(i => {
      if (!i.estimated_arrival || i.status === 'delivered') return false;
      return new Date(i.estimated_arrival) < new Date();
    }).length;

    const onTimeDeliveryRate = totalOrders > 0
      ? ((deliveredOrders / totalOrders) * 100).toFixed(1)
      : 0;

    const delayRate = totalOrders > 0
      ? ((delayedOrders / totalOrders) * 100).toFixed(1)
      : 0;

    const totalQuantityOrdered = items.reduce((s, i) => s + (i.quantity || 0), 0);

    const performanceMetrics = {
      supplier: supplierName,
      total_orders: totalOrders,
      delivered: deliveredOrders,
      in_transit: inTransit,
      in_customs: inCustoms,
      delayed: delayedOrders,
      on_time_delivery_rate_pct: parseFloat(onTimeDeliveryRate),
      delay_rate_pct: parseFloat(delayRate),
      total_quantity_ordered: totalQuantityOrdered,
      items: items.map(i => ({
        item_name: i.item_name,
        status: i.status,
        estimated_arrival: i.estimated_arrival,
        quantity: i.quantity,
        tracking_number: i.tracking_number
      }))
    };

    // AI vendor risk assessment
    const systemPrompt = `You are a supply chain risk AI analyst. Evaluate supplier performance and provide a vendor risk assessment.
    Format your response with: Vendor Risk Score (1-10, where 10 is highest risk), Performance Analysis, Key Risk Factors, Recommendations, and Overall Risk Level (Low/Medium/High/Critical).`;

    const prompt = `Evaluate this supplier's performance and provide a risk assessment:
    ${JSON.stringify(performanceMetrics, null, 2)}`;

    let aiAssessment = null;
    let aiError = null;
    let riskScore = null;
    try {
      const aiResult = await openRouterService.makeRequest(
        [{ role: 'user', content: prompt }],
        systemPrompt
      );
      aiAssessment = aiResult.choices[0].message.content;

      // Extract risk score
      const scoreMatch = aiAssessment.match(/Vendor Risk Score[:\s]*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i);
      riskScore = scoreMatch ? parseFloat(scoreMatch[1]) : null;
    } catch (aiErr) {
      aiError = 'AI assessment unavailable';
      console.error('Supplier scoring AI error:', aiErr.message);
    }

    res.json({
      ...performanceMetrics,
      risk_score: riskScore,
      ai_assessment: aiAssessment,
      ai_error: aiError,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Supplier scoring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// SHIFT HANDOFF REPORT
// =====================
// POST /api/reports/shift-handoff — AI summary of the shift formatted for the next shift
app.post('/api/reports/shift-handoff', authenticateToken, async (req, res) => {
  try {
    const { shift_id, shift_name, department } = req.body;

    // Get shift details
    let shiftData = null;
    if (shift_id) {
      const shiftResult = await pool.query('SELECT * FROM shifts WHERE id = $1', [shift_id]);
      shiftData = shiftResult.rows[0] || null;
    }

    // Gather production data (assembly lines)
    let assemblyData;
    if (department) {
      assemblyData = await pool.query(
        'SELECT name, product, capacity, current_output, efficiency, workers, stations, bottleneck, status FROM assembly_lines WHERE department ILIKE $1 OR name ILIKE $1 ORDER BY efficiency ASC',
        [`%${department}%`]
      );
    } else {
      assemblyData = await pool.query(
        'SELECT name, product, capacity, current_output, efficiency, workers, stations, bottleneck, status FROM assembly_lines ORDER BY efficiency ASC'
      );
    }

    // Gather equipment status (any in warning or critical)
    const equipmentAlerts = await pool.query(`
      SELECT name, type, location, status, temperature, vibration, failure_probability, ai_prediction
      FROM equipment
      WHERE status != 'operational' OR failure_probability > 40
      ORDER BY failure_probability DESC
      LIMIT 10
    `);

    // Gather recent safety incidents (created today)
    const safetyIncidents = await pool.query(`
      SELECT title, description, location, severity, incident_type, status, risk_score
      FROM safety_incidents
      WHERE created_at >= NOW() - INTERVAL '12 hours'
      ORDER BY risk_score DESC NULLS LAST
    `);

    // Gather unresolved notifications
    const pendingAlerts = await pool.query(`
      SELECT title, message, severity, related_entity, created_at
      FROM notifications
      WHERE read = false AND created_at >= NOW() - INTERVAL '12 hours'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const handoffContext = {
      shift: shiftData || { name: shift_name || 'Current Shift', department: department || 'All Departments' },
      report_generated_at: new Date().toISOString(),
      production_summary: {
        total_lines: assemblyData.rows.length,
        avg_efficiency: assemblyData.rows.length
          ? (assemblyData.rows.reduce((s, r) => s + parseFloat(r.efficiency || 0), 0) / assemblyData.rows.length).toFixed(1)
          : 0,
        lines: assemblyData.rows
      },
      equipment_alerts: {
        count: equipmentAlerts.rows.length,
        items: equipmentAlerts.rows.map(e => ({
          name: e.name,
          location: e.location,
          status: e.status,
          failure_probability: e.failure_probability,
          temperature: e.temperature
        }))
      },
      safety_incidents: {
        count: safetyIncidents.rows.length,
        incidents: safetyIncidents.rows
      },
      pending_notifications: pendingAlerts.rows.length,
      unresolved_items: pendingAlerts.rows
    };

    const systemPrompt = `You are a manufacturing operations AI assistant. Generate a concise, professional shift handoff report.
    Format the report for the incoming shift team with these sections:
    1. Shift Summary (brief overview of what happened)
    2. Production Status (key metrics and any shortfalls)
    3. Equipment Issues (what needs immediate attention)
    4. Safety Incidents (anything reported this shift)
    5. Priority Actions for Next Shift (top 3-5 action items)
    6. Notes & Handoff Items (anything the next shift should know)
    Keep it scannable and actionable. Use bullet points where appropriate.`;

    const prompt = `Generate a shift handoff report based on this data:
    ${JSON.stringify(handoffContext, null, 2)}`;

    let report = null;
    let aiError = null;
    try {
      const aiResult = await openRouterService.makeRequest(
        [{ role: 'user', content: prompt }],
        systemPrompt
      );
      report = aiResult.choices[0].message.content;
    } catch (aiErr) {
      aiError = 'AI report generation unavailable';
      // Fallback text report
      report = `## Shift Handoff Report — ${new Date().toLocaleString()}\n\n` +
        `### Production Status\n` +
        assemblyData.rows.map(l => `- ${l.name}: ${l.efficiency}% efficiency, ${l.current_output}/${l.capacity} units${l.bottleneck ? ` (bottleneck: ${l.bottleneck})` : ''}`).join('\n') +
        `\n\n### Equipment Alerts\n` +
        (equipmentAlerts.rows.length > 0
          ? equipmentAlerts.rows.map(e => `- ${e.name} (${e.location}): ${e.status}, failure risk ${e.failure_probability}%`).join('\n')
          : 'No equipment alerts') +
        `\n\n### Safety Incidents\n` +
        (safetyIncidents.rows.length > 0
          ? safetyIncidents.rows.map(i => `- [${i.severity.toUpperCase()}] ${i.title} at ${i.location}`).join('\n')
          : 'No safety incidents this shift');
      console.error('Shift handoff AI error:', aiErr.message);
    }

    // Emit shift handoff via WebSocket
    broadcast({
      type: 'production:update',
      data: {
        event: 'shift_handoff',
        shift: handoffContext.shift,
        timestamp: new Date().toISOString(),
        summary: report ? report.substring(0, 300) + '...' : 'Shift handoff report generated'
      }
    });

    res.json({
      shift: handoffContext.shift,
      report,
      context: handoffContext,
      ai_error: aiError,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Shift handoff report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// GLOBAL SEARCH
// =====================
app.get('/api/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ results: [] });
    const searchTerm = `%${q}%`;
    const [equipment, routes, safety, assembly, supplyChain] = await Promise.all([
      pool.query('SELECT id, name, type as subtitle, status, \'equipment\' as entity_type FROM equipment WHERE name ILIKE $1 OR type ILIKE $1 OR location ILIKE $1 LIMIT 5', [searchTerm]),
      pool.query('SELECT id, name, origin || \' -> \' || destination as subtitle, status, \'routes\' as entity_type FROM routes WHERE name ILIKE $1 OR origin ILIKE $1 OR destination ILIKE $1 LIMIT 5', [searchTerm]),
      pool.query('SELECT id, title as name, incident_type as subtitle, status, \'safety\' as entity_type FROM safety_incidents WHERE title ILIKE $1 OR description ILIKE $1 OR location ILIKE $1 LIMIT 5', [searchTerm]),
      pool.query('SELECT id, name, product as subtitle, status, \'assembly\' as entity_type FROM assembly_lines WHERE name ILIKE $1 OR product ILIKE $1 LIMIT 5', [searchTerm]),
      pool.query('SELECT id, item_name as name, supplier as subtitle, status, \'supply-chain\' as entity_type FROM supply_chain WHERE item_name ILIKE $1 OR supplier ILIKE $1 OR tracking_number ILIKE $1 LIMIT 5', [searchTerm]),
    ]);
    res.json({
      results: {
        equipment: equipment.rows,
        routes: routes.rows,
        safety: safety.rows,
        assembly: assembly.rows,
        supplyChain: supplyChain.rows,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// DATA EXPORT
// =====================
app.get('/api/export/:type', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;
    const tableMap = {
      equipment: 'equipment',
      safety: 'safety_incidents',
      routes: 'routes',
      assembly: 'assembly_lines',
      'supply-chain': 'supply_chain',
      'audit-logs': 'audit_logs',
      shifts: 'shifts',
    };
    const table = tableMap[type];
    if (!table) return res.status(400).json({ error: 'Invalid export type' });
    const result = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No data to export' });
    const headers = Object.keys(result.rows[0]);
    const csvRows = [headers.join(',')];
    result.rows.forEach(row => {
      csvRows.push(headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','));
    });
    await logAudit(req.user.id, req.user.email, 'EXPORT', type, null, `Exported ${result.rows.length} ${type} records`, req.ip);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_export_${Date.now()}.csv`);
    res.send(csvRows.join('\n'));
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// SEED SAMPLE DATA ROUTES
// =====================
app.post('/api/seed/equipment', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO equipment (name, type, location, status, last_maintenance, next_maintenance, temperature, vibration, runtime_hours, failure_probability) VALUES
      ('CNC Machine A1', 'CNC Mill', 'Building A - Floor 1', 'operational', '2024-01-15', '2024-04-15', 45.5, 2.3, 12500, 15.2),
      ('CNC Machine A2', 'CNC Mill', 'Building A - Floor 1', 'warning', '2024-01-10', '2024-03-10', 52.8, 4.1, 15200, 35.8),
      ('Hydraulic Press B1', 'Press', 'Building B - Floor 1', 'operational', '2024-02-01', '2024-05-01', 38.2, 1.8, 8900, 8.5),
      ('Assembly Robot R1', 'Robot', 'Building A - Floor 2', 'operational', '2024-01-20', '2024-04-20', 32.1, 0.9, 6500, 5.2),
      ('Welding Station W1', 'Welder', 'Building B - Floor 2', 'operational', '2024-02-05', '2024-05-05', 85.3, 3.5, 4500, 22.4),
      ('Packaging Machine P1', 'Packager', 'Building C - Floor 1', 'warning', '2023-11-20', '2024-02-20', 42.1, 5.2, 18500, 45.6),
      ('Injection Molder IM1', 'Molder', 'Building B - Floor 1', 'critical', '2023-10-15', '2024-01-15', 68.4, 6.8, 25000, 72.5),
      ('Compressor CP1', 'Compressor', 'Utility Room', 'warning', '2023-12-01', '2024-03-01', 75.2, 4.5, 32000, 55.3)
    `);
    res.json({ message: 'Equipment sample data loaded', count: 8 });
  } catch (error) {
    console.error('Seed equipment error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

app.post('/api/seed/routes', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO routes (name, origin, destination, distance, estimated_time, vehicle_type, priority, status, waypoints) VALUES
      ('Chicago to Detroit', 'Chicago, IL', 'Detroit, MI', 450.5, 280, 'Semi-Truck', 'high', 'active', 'Gary, Kalamazoo'),
      ('LA to Phoenix', 'Los Angeles, CA', 'Phoenix, AZ', 580.2, 350, 'Semi-Truck', 'normal', 'pending', 'Palm Springs, Blythe'),
      ('NYC to Boston', 'New York, NY', 'Boston, MA', 340.8, 240, 'Van', 'urgent', 'active', 'Hartford'),
      ('Dallas to Houston', 'Dallas, TX', 'Houston, TX', 385.0, 230, 'Semi-Truck', 'normal', 'completed', 'Corsicana, Buffalo'),
      ('Seattle to Portland', 'Seattle, WA', 'Portland, OR', 280.5, 180, 'Van', 'low', 'pending', 'Tacoma, Olympia'),
      ('Miami to Orlando', 'Miami, FL', 'Orlando, FL', 380.0, 220, 'Box Truck', 'high', 'active', 'Fort Lauderdale, West Palm Beach'),
      ('Atlanta to Nashville', 'Atlanta, GA', 'Nashville, TN', 400.2, 250, 'Van', 'urgent', 'active', 'Chattanooga'),
      ('Philadelphia to DC', 'Philadelphia, PA', 'Washington, DC', 220.8, 150, 'Box Truck', 'high', 'active', 'Baltimore')
    `);
    res.json({ message: 'Routes sample data loaded', count: 8 });
  } catch (error) {
    console.error('Seed routes error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

app.post('/api/seed/safety', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO safety_incidents (title, description, location, severity, incident_type, reported_by, status, risk_score) VALUES
      ('Wet Floor Slip Hazard', 'Water leak from cooling system creating slip hazard', 'Building A - Floor 1', 'medium', 'slip_fall', 'John Smith', 'open', 45.5),
      ('Missing Machine Guard', 'Safety guard removed from CNC machine not replaced', 'Building A - Floor 1', 'high', 'equipment', 'Mike Johnson', 'investigating', 72.3),
      ('Electrical Hazard', 'Exposed wiring near assembly station', 'Building A - Floor 2', 'critical', 'electrical', 'Tom Brown', 'open', 85.6),
      ('Forklift Near Miss', 'Forklift nearly struck pedestrian in warehouse', 'Warehouse', 'high', 'vehicle', 'Lisa Davis', 'investigating', 68.9),
      ('Blocked Emergency Exit', 'Pallets blocking emergency exit door', 'Building B - Floor 1', 'high', 'egress', 'David Garcia', 'resolved', 65.8),
      ('Ventilation Failure', 'Paint booth ventilation not functioning properly', 'Building C - Floor 2', 'high', 'environmental', 'Kevin Thomas', 'investigating', 71.5),
      ('Crane Inspection Overdue', 'Overhead crane past scheduled inspection', 'Building B - Floor 2', 'critical', 'equipment', 'Linda Harris', 'open', 88.4),
      ('PPE Non-Compliance', 'Workers not wearing required safety glasses', 'Building A - Floor 3', 'medium', 'ppe', 'Jennifer Martinez', 'open', 35.7)
    `);
    res.json({ message: 'Safety incidents sample data loaded', count: 8 });
  } catch (error) {
    console.error('Seed safety error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

app.post('/api/seed/assembly', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO assembly_lines (name, product, capacity, current_output, efficiency, workers, stations, bottleneck, status) VALUES
      ('Line Alpha', 'Engine Components', 500, 425, 85.0, 12, 8, 'Station 3 - Welding', 'running'),
      ('Line Beta', 'Transmission Parts', 400, 380, 95.0, 10, 6, 'None', 'running'),
      ('Line Gamma', 'Brake Systems', 350, 280, 80.0, 8, 5, 'Station 2 - Assembly', 'running'),
      ('Line Epsilon', 'Dashboard Components', 300, 195, 65.0, 9, 7, 'Station 4 - Quality Check', 'warning'),
      ('Line Iota', 'Steering Columns', 300, 210, 70.0, 9, 6, 'Station 1 - Material Feed', 'warning'),
      ('Line Lambda', 'HVAC Units', 280, 168, 60.0, 8, 6, 'Station 5 - Integration', 'critical'),
      ('Line Xi', 'Body Panels', 200, 150, 75.0, 7, 5, 'Station 3 - Pressing', 'running'),
      ('Line Pi', 'Audio Systems', 350, 0, 0.0, 10, 7, 'All Stations', 'stopped')
    `);
    res.json({ message: 'Assembly lines sample data loaded', count: 8 });
  } catch (error) {
    console.error('Seed assembly error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

app.post('/api/seed/supply-chain', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO supply_chain (item_name, supplier, origin_location, current_location, destination, quantity, status, estimated_arrival, tracking_number) VALUES
      ('Steel Coils', 'US Steel Corp', 'Pittsburgh, PA', 'Indianapolis, IN', 'Detroit Plant', 5000, 'in_transit', '2024-02-20', 'USC-2024-001234'),
      ('Electronic Components', 'Samsung Electronics', 'Seoul, Korea', 'Los Angeles Port', 'San Jose Plant', 25000, 'customs', '2024-02-25', 'SAM-2024-009012'),
      ('Rubber Gaskets', 'Goodyear', 'Akron, OH', 'Delivered', 'Detroit Plant', 10000, 'delivered', '2024-02-15', 'GDY-2024-003456'),
      ('Copper Wiring', 'Phelps Dodge', 'Phoenix, AZ', 'Albuquerque, NM', 'Dallas Plant', 15000, 'in_transit', '2024-02-21', 'PHD-2024-002345'),
      ('Lithium Batteries', 'Panasonic', 'Osaka, Japan', 'San Francisco Port', 'Fremont Plant', 5000, 'customs', '2024-02-28', 'PAN-2024-001234'),
      ('Carbon Fiber', 'Toray Industries', 'Tokyo, Japan', 'Seattle Port', 'Portland Plant', 1500, 'in_transit', '2024-02-24', 'TOR-2024-005678'),
      ('Sensors', 'Bosch', 'Stuttgart, Germany', 'New York Port', 'Boston Plant', 8000, 'customs', '2024-02-26', 'BSH-2024-002345'),
      ('Microchips', 'Intel', 'Santa Clara, CA', 'Fresno, CA', 'Los Angeles Plant', 12000, 'in_transit', '2024-02-19', 'INT-2024-001234')
    `);
    res.json({ message: 'Supply chain sample data loaded', count: 8 });
  } catch (error) {
    console.error('Seed supply chain error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

app.post('/api/seed/notifications', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO notifications (title, message, type, severity, related_entity, related_id, user_id) VALUES
      ('Equipment Critical Alert', 'Injection Molder IM1 failure probability at 72.5%', 'alert', 'critical', 'equipment', 7, $1),
      ('Maintenance Due', 'CNC Machine A2 maintenance overdue by 15 days', 'warning', 'high', 'equipment', 2, $1),
      ('Safety Incident Reported', 'New critical electrical hazard reported in Building A', 'alert', 'critical', 'safety', 3, $1),
      ('Route Completed', 'Dallas to Houston delivery completed successfully', 'info', 'low', 'routes', 4, $1),
      ('Assembly Line Warning', 'Line Lambda efficiency dropped below 65%', 'warning', 'high', 'assembly', 6, $1),
      ('Supply Chain Delay', 'Samsung Electronics shipment delayed at customs', 'warning', 'medium', 'supply_chain', 2, $1),
      ('Shift Change Reminder', 'Night shift starting in 30 minutes', 'info', 'low', 'shifts', 1, $1),
      ('Equipment Temperature Alert', 'Welding Station W1 temperature exceeding normal range', 'alert', 'medium', 'equipment', 5, $1),
      ('Crane Inspection Overdue', 'Building B overhead crane needs immediate inspection', 'alert', 'critical', 'safety', 7, $1),
      ('New Feedback Received', 'User submitted bug report about dashboard loading', 'info', 'low', 'feedback', 1, $1),
      ('Compressor Warning', 'Compressor CP1 vibration levels increasing', 'warning', 'high', 'equipment', 8, $1),
      ('Route Optimization Available', 'AI suggests 15% fuel savings on Chicago-Detroit route', 'info', 'low', 'routes', 1, $1),
      ('PPE Compliance Alert', 'Safety glasses compliance below 80% in Building A', 'warning', 'medium', 'safety', 8, $1),
      ('Packaging Machine Alert', 'Packaging Machine P1 approaching failure threshold', 'alert', 'high', 'equipment', 6, $1),
      ('Supply Delivery Confirmed', 'Rubber Gaskets order delivered to Detroit Plant', 'info', 'low', 'supply_chain', 3, $1)
    `, [req.user.id]);
    res.json({ message: 'Notifications sample data loaded', count: 15 });
  } catch (error) {
    console.error('Seed notifications error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

app.post('/api/seed/shifts', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO shifts (name, supervisor, start_time, end_time, department, workers_assigned, status, notes) VALUES
      ('Morning Shift A', 'John Smith', '06:00', '14:00', 'Manufacturing', 25, 'active', 'Full crew available'),
      ('Afternoon Shift A', 'Sarah Johnson', '14:00', '22:00', 'Manufacturing', 22, 'scheduled', 'Two workers on leave'),
      ('Night Shift A', 'Mike Brown', '22:00', '06:00', 'Manufacturing', 18, 'scheduled', 'Reduced crew for night ops'),
      ('Morning Shift B', 'Lisa Davis', '06:00', '14:00', 'Assembly', 30, 'active', 'Overtime approved'),
      ('Afternoon Shift B', 'Tom Wilson', '14:00', '22:00', 'Assembly', 28, 'scheduled', 'New trainees starting'),
      ('Night Shift B', 'Amy Chen', '22:00', '06:00', 'Assembly', 15, 'scheduled', 'Maintenance window 2-4 AM'),
      ('Day Shift - QC', 'Robert Taylor', '08:00', '16:00', 'Quality Control', 12, 'active', 'Audit week - extra inspections'),
      ('Evening Shift - QC', 'Karen White', '16:00', '00:00', 'Quality Control', 8, 'scheduled', 'Focus on assembly output'),
      ('Morning Shift - Warehouse', 'David Garcia', '05:00', '13:00', 'Warehouse', 20, 'active', 'Large shipment expected'),
      ('Afternoon Shift - Warehouse', 'Jennifer Martinez', '13:00', '21:00', 'Warehouse', 18, 'scheduled', 'Inventory count scheduled'),
      ('Swing Shift - Maintenance', 'Chris Anderson', '10:00', '18:00', 'Maintenance', 10, 'active', 'Planned equipment repairs'),
      ('Night Shift - Maintenance', 'Paul Robinson', '18:00', '02:00', 'Maintenance', 6, 'scheduled', 'Emergency on-call available'),
      ('Day Shift - Safety', 'Linda Harris', '07:00', '15:00', 'Safety', 8, 'active', 'Safety audit in Building B'),
      ('Morning Shift - Logistics', 'Kevin Thomas', '06:00', '14:00', 'Logistics', 14, 'active', 'Priority shipments pending'),
      ('Afternoon Shift - Logistics', 'Nancy Jackson', '14:00', '22:00', 'Logistics', 12, 'scheduled', 'Route optimization review'),
      ('Weekend Shift', 'Mark Clark', '08:00', '20:00', 'Manufacturing', 15, 'scheduled', 'Saturday overtime crew')
    `);
    res.json({ message: 'Shifts sample data loaded', count: 16 });
  } catch (error) {
    console.error('Seed shifts error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

app.post('/api/seed/feedback', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO feedback (user_id, user_email, type, subject, message, rating, status) VALUES
      ($1, $2, 'bug', 'Dashboard loading slow', 'The dashboard takes too long to load when there are many equipment items', 3, 'pending'),
      ($1, $2, 'feature', 'Export to PDF', 'Would be great to export reports in PDF format', 4, 'pending'),
      ($1, $2, 'general', 'Great platform', 'Really enjoying the AI predictions feature', 5, 'reviewed'),
      ($1, $2, 'bug', 'Search not working for special characters', 'When I search with & symbol, it returns no results', 2, 'in_progress'),
      ($1, $2, 'feature', 'Mobile app', 'A mobile app would be very useful for floor managers', 4, 'pending'),
      ($1, $2, 'general', 'Training materials', 'Need more documentation for new operators', 3, 'reviewed'),
      ($1, $2, 'bug', 'Assembly line chart not rendering', 'The efficiency chart shows blank on Firefox', 2, 'in_progress'),
      ($1, $2, 'feature', 'Slack integration', 'Would like notifications sent to Slack channels', 4, 'pending'),
      ($1, $2, 'general', 'Shift scheduling improvement', 'The shift management feature saves us hours of planning', 5, 'reviewed'),
      ($1, $2, 'bug', 'Date picker timezone issue', 'Maintenance dates showing wrong in Pacific timezone', 3, 'pending'),
      ($1, $2, 'feature', 'Batch equipment updates', 'Ability to update multiple equipment items at once', 4, 'pending'),
      ($1, $2, 'general', 'Safety predictions accurate', 'The AI safety predictions have been very accurate', 5, 'reviewed'),
      ($1, $2, 'bug', 'Notification bell not updating', 'Unread count does not decrease after reading', 2, 'in_progress'),
      ($1, $2, 'feature', 'Custom dashboard widgets', 'Let users customize their dashboard layout', 4, 'pending'),
      ($1, $2, 'general', 'Route optimizer feedback', 'Saved 20% on fuel costs using route optimization', 5, 'reviewed'),
      ($1, $2, 'feature', 'Multi-language support', 'Support for Spanish and Mandarin would be helpful', 3, 'pending')
    `, [req.user.id, req.user.email]);
    res.json({ message: 'Feedback sample data loaded', count: 16 });
  } catch (error) {
    console.error('Seed feedback error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

app.post('/api/seed/audit-logs', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Seeding not allowed in production' });
  try {
    await pool.query(`
      INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, details, ip_address) VALUES
      ($1, $2, 'LOGIN', 'user', $1, 'User logged in successfully', '192.168.1.100'),
      ($1, $2, 'CREATE', 'equipment', 1, 'Created CNC Machine A1', '192.168.1.100'),
      ($1, $2, 'UPDATE', 'equipment', 2, 'Updated CNC Machine A2 status to warning', '192.168.1.100'),
      ($1, $2, 'DELETE', 'route', 5, 'Deleted route Seattle to Portland', '192.168.1.101'),
      ($1, $2, 'CREATE', 'safety', 3, 'Reported electrical hazard in Building A', '192.168.1.102'),
      ($1, $2, 'CHANGE_ROLE', 'user', 2, 'Changed operator role to manager', '192.168.1.100'),
      ($1, $2, 'EXPORT', 'equipment', NULL, 'Exported 16 equipment records to CSV', '192.168.1.100'),
      ($1, $2, 'UPDATE', 'assembly', 6, 'Updated Line Lambda efficiency', '192.168.1.103'),
      ($1, $2, 'CREATE', 'shift', 1, 'Created Morning Shift A', '192.168.1.100'),
      ($1, $2, 'LOGIN', 'user', 2, 'Operator logged in', '192.168.1.104'),
      ($1, $2, 'UPDATE', 'supply_chain', 1, 'Updated Steel Coils tracking status', '192.168.1.100'),
      ($1, $2, 'DELETE', 'safety', 14, 'Resolved and archived first aid incident', '192.168.1.100'),
      ($1, $2, 'UPLOAD', 'file', 1, 'Uploaded incident photo for safety report', '192.168.1.102'),
      ($1, $2, 'UPDATE_PROFILE', 'user', $1, 'Admin updated profile information', '192.168.1.100'),
      ($1, $2, 'PASSWORD_RESET', 'user', 3, 'Manager password reset', '192.168.1.105'),
      ($1, $2, 'CREATE', 'feedback', 1, 'Submitted bug report about dashboard', '192.168.1.106')
    `, [req.user.id, req.user.email]);
    res.json({ message: 'Audit logs sample data loaded', count: 16 });
  } catch (error) {
    console.error('Seed audit logs error:', error);
    res.status(500).json({ error: 'Failed to load sample data' });
  }
});

// =====================
// DASHBOARD STATS
// =====================
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const cached = statsCache.get('dashboardStats');
    if (cached) return res.json(cached);

    const [equipmentStats, routeStats, safetyStats, assemblyStats, supplyStats, notifStats, shiftStats] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'critical') as critical,
        COUNT(*) FILTER (WHERE status = 'warning') as warning, AVG(failure_probability) as avg_failure_prob FROM equipment`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed, COUNT(*) FILTER (WHERE status = 'pending') as pending FROM routes`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical, AVG(risk_score) as avg_risk FROM safety_incidents`),
      pool.query(`SELECT COUNT(*) as total, AVG(efficiency) as avg_efficiency, SUM(current_output) as total_output FROM assembly_lines`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'in_transit') as in_transit,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered FROM supply_chain`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE read = false) as unread FROM notifications WHERE user_id = $1`, [req.user.id]),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM shifts`),
    ]);

    const result = {
      equipment: equipmentStats.rows[0],
      routes: routeStats.rows[0],
      safety: safetyStats.rows[0],
      assembly: assemblyStats.rows[0],
      supplyChain: supplyStats.rows[0],
      notifications: notifStats.rows[0],
      shifts: shiftStats.rows[0],
    };
    statsCache.set('dashboardStats', result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// =====================
// WEBSOCKET SERVER
// =====================
const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (token) {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      wsClients.set(ws, user);
      ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));
    } catch (e) {
      ws.close(1008, 'Invalid token');
    }
  }
  ws.on('close', () => wsClients.delete(ws));
});

function broadcastToUser(userId, data) {
  wsClients.forEach((user, ws) => {
    if (user.id === userId && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  });
}

function broadcast(data) {
  wsClients.forEach((user, ws) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
  });
}

// =====================
// AI MECHANICAL-BACKLOG ENDPOINTS
// =====================

// POST /api/ai/quality-defect-prediction
app.post('/api/ai/quality-defect-prediction', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { product, batch_size, defect_history, inspection_results, process_params } = req.body || {};
    if (!product) return res.status(400).json({ error: 'product is required' });
    const result = await openRouterService.predictQualityDefects({
      product, batch_size, defect_history, inspection_results, process_params
    });
    res.json(result);
  } catch (err) {
    const code = err.statusCode || 500;
    console.error('quality-defect-prediction error:', err.message);
    res.status(code).json({ error: err.message });
  }
});

// POST /api/ai/oee-anomaly-detection
app.post('/api/ai/oee-anomaly-detection', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { line_id, availability, performance, quality, telemetry, history } = req.body || {};
    if (availability == null && performance == null && quality == null) {
      return res.status(400).json({ error: 'availability, performance, or quality is required' });
    }
    const result = await openRouterService.detectOEEAnomalies({
      line_id, availability, performance, quality, telemetry, history
    });
    res.json(result);
  } catch (err) {
    const code = err.statusCode || 500;
    console.error('oee-anomaly-detection error:', err.message);
    res.status(code).json({ error: err.message });
  }
});

// POST /api/ai/inventory-stockout-predict
app.post('/api/ai/inventory-stockout-predict', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { sku, on_hand, lead_time_days, demand_history, pending_orders, safety_stock } = req.body || {};
    if (!sku) return res.status(400).json({ error: 'sku is required' });
    const result = await openRouterService.predictInventoryStockout({
      sku, on_hand, lead_time_days, demand_history, pending_orders, safety_stock
    });
    res.json(result);
  } catch (err) {
    const code = err.statusCode || 500;
    console.error('inventory-stockout-predict error:', err.message);
    res.status(code).json({ error: err.message });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);
});

// === BATCH 05 AUTO-MOUNT (custom feature suggestions) ===
app.use('/api/ai/production-planner-agent', require('./routes/production-planner-agent'));
app.use('/api/ai/vision-quality-inspect', require('./routes/vision-quality-inspect'));
app.use('/api/ai/oee-anomaly-stream', require('./routes/oee-anomaly-stream'));
app.use('/api/ai/digital-twin', require('./routes/digital-twin'));
app.use('/api/ai/supplier-risk-monitor', require('./routes/supplier-risk-monitor'));

// === Batch 05 Gaps & Frontend Mounts ===
try { const _gap_ai_production_schedule_optimizer = require('./routes/gap-ai-production-schedule-optimizer'); app.use('/api/gap-ai-production-schedule-optimizer', _gap_ai_production_schedule_optimizer); } catch(e) { console.error('gap mount fail ai-production-schedule-optimizer:', e.message); }
try { const _gap_ai_energy_consumption_forecast = require('./routes/gap-ai-energy-consumption-forecast'); app.use('/api/gap-ai-energy-consumption-forecast', _gap_ai_energy_consumption_forecast); } catch(e) { console.error('gap mount fail ai-energy-consumption-forecast:', e.message); }
try { const _gap_ai_maintenance_windowing = require('./routes/gap-ai-maintenance-windowing'); app.use('/api/gap-ai-maintenance-windowing', _gap_ai_maintenance_windowing); } catch(e) { console.error('gap mount fail ai-maintenance-windowing:', e.message); }
try { const _gap_ai_workforce_skill_gap = require('./routes/gap-ai-workforce-skill-gap'); app.use('/api/gap-ai-workforce-skill-gap', _gap_ai_workforce_skill_gap); } catch(e) { console.error('gap mount fail ai-workforce-skill-gap:', e.message); }
try { const _gap_nested = require('./routes/gap-nested'); app.use('/api/gap-nested', _gap_nested); } catch(e) { console.error('gap mount fail nested:', e.message); }
try { const _gap_substantive = require('./routes/gap-substantive'); app.use('/api/gap-substantive', _gap_substantive); } catch(e) { console.error('gap mount fail substantive:', e.message); }
try { const _gap_webhooks = require('./routes/gap-webhooks'); app.use('/api/gap-webhooks', _gap_webhooks); } catch(e) { console.error('gap mount fail webhooks:', e.message); }
try { const _gap_real_time = require('./routes/gap-real-time'); app.use('/api/gap-real-time', _gap_real_time); } catch(e) { console.error('gap mount fail real-time:', e.message); }
try { const _gap_mobile = require('./routes/gap-mobile'); app.use('/api/gap-mobile', _gap_mobile); } catch(e) { console.error('gap mount fail mobile:', e.message); }
try { const _gap_customer_order_side = require('./routes/gap-customer-order-side'); app.use('/api/gap-customer-order-side', _gap_customer_order_side); } catch(e) { console.error('gap mount fail customer-order-side:', e.message); }
try { const _gap_limited = require('./routes/gap-limited'); app.use('/api/gap-limited', _gap_limited); } catch(e) { console.error('gap mount fail limited:', e.message); }
// === End Batch 05 Mounts ===

// =====================
// ERP LAYER (AI-Native ERP routes)
// =====================
try { app.use('/api/erp/gl-chart-of-accounts', require('./routes/erpFeat_glChartOfAccounts')); console.log('[mount] /api/erp/gl-chart-of-accounts ready'); } catch (e) { console.error('ERP mount fail gl-chart-of-accounts:', e.message); }
try { app.use('/api/erp/ap-ar', require('./routes/erpFeat_apAr')); console.log('[mount] /api/erp/ap-ar ready'); } catch (e) { console.error('ERP mount fail ap-ar:', e.message); }
try { app.use('/api/erp/inventory-gl', require('./routes/erpFeat_inventoryGl')); console.log('[mount] /api/erp/inventory-gl ready'); } catch (e) { console.error('ERP mount fail inventory-gl:', e.message); }
try { app.use('/api/erp/mrp', require('./routes/erpFeat_mrp')); console.log('[mount] /api/erp/mrp ready'); } catch (e) { console.error('ERP mount fail mrp:', e.message); }
try { app.use('/api/erp/boms', require('./routes/erpFeat_boms')); console.log('[mount] /api/erp/boms ready'); } catch (e) { console.error('ERP mount fail boms:', e.message); }
try { app.use('/api/erp/cost-accounting', require('./routes/erpFeat_costAccounting')); console.log('[mount] /api/erp/cost-accounting ready'); } catch (e) { console.error('ERP mount fail cost-accounting:', e.message); }
try { app.use('/api/erp/consolidations', require('./routes/erpFeat_consolidations')); console.log('[mount] /api/erp/consolidations ready'); } catch (e) { console.error('ERP mount fail consolidations:', e.message); }
try { app.use('/api/erp/multi-currency', require('./routes/erpFeat_multiCurrency')); console.log('[mount] /api/erp/multi-currency ready'); } catch (e) { console.error('ERP mount fail multi-currency:', e.message); }
try { app.use('/api/erp/intercompany', require('./routes/erpFeat_intercompany')); console.log('[mount] /api/erp/intercompany ready'); } catch (e) { console.error('ERP mount fail intercompany:', e.message); }

// =====================
// CUSTOM VIEWS (mounted BEFORE 404 / error handler)
// =====================
try {
  app.use('/api/custom-views', require('./routes/customViews'));
  console.log('[mount] /api/custom-views ready');
} catch (e) {
  console.error('Failed to mount customViews:', e.message);
}

try {
  app.use('/api/scrap-rework-loop', authenticateToken, require('./routes/scrap-rework-loop'));
  console.log('[mount] /api/scrap-rework-loop ready');
} catch (e) {
  console.error('Failed to mount scrap-rework-loop:', e.message);
}

// =====================
// 404 HANDLER (after all mounts)
// =====================
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// =====================
// GLOBAL ERROR HANDLER (final)
// =====================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
// === End custom-views & terminal middleware ===
