import { verifyAccessToken } from '../config/jwt.js';
import { User } from '../models/User.js';

export async function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const user = await User.findById(payload.sub).exec();
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if ((user.tokenVersion || 0) !== (payload.tv || 0)) {
    return res.status(401).json({ error: 'Token invalidated' });
  }

  req.user = user;
  next();
}

export function attachUser(req, _res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) { req.authenticated = false; return next(); }
  const payload = verifyAccessToken(token);
  req.authenticated = Boolean(payload);
  req.jwt = payload || null;
  next();
}
