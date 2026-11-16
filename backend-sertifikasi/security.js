const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const hash = (v) => crypto.createHash('sha256').update(String(v)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(hash(a), hash(b)); // perbandingan waktu-konstan

// 1. Validasi secret Webhook Supabase
function verifyWebhookSecret(req, res, next) {
  const expected = process.env.WEBHOOK_SECRET_KEY;
  const given = req.headers['x-webhook-secret'];
  if (!expected || !given || !safeEqual(given, expected)) { // gagal tertutup bila secret belum di-set
    return res.status(401).json({ success: false, message: 'Unauthorized Access' });
  }
  next();
}

// 2. Wajib login untuk semua endpoint /api/admin/*
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Login diperlukan' });
  }
}

// 3. CORS allowlist (hanya untuk browser/WebView)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
  allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = { verifyWebhookSecret, requireAdmin, corsOptions };
