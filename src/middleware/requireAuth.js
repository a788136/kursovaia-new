// middleware/requireAuth.js
import jwt from 'jsonwebtoken';
import { loadEnv } from '../config/env.js';

export function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { JWT_SECRET } = loadEnv();
    const payload = jwt.verify(token, JWT_SECRET);

    // ожидаем, что при выдаче токена кладёте user._id и, возможно, isAdmin/role
    req.user = {
      _id: payload._id || payload.id,
      email: payload.email,
      isAdmin: !!payload.isAdmin,
      role: payload.role
    };

    if (!req.user._id) return res.status(401).json({ error: 'Invalid token' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
