// src/routes/auth-local.js
import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadEnv } from '../config/env.js';

const router = Router();
const db = () => mongoose.connection.db;
const { JWT_SECRET = 'dev_secret', NODE_ENV } = loadEnv();

/** Приводим пользователя к безопасному виду для клиента */
function toClientUser(u) {
  if (!u) return null;
  return {
    id: String(u._id),
    name: u.name || '',
    email: u.email || '',
    avatar: u.avatar || '',
    role: u.role || (u.isAdmin ? 'admin' : 'user'),
    isAdmin: !!(u.isAdmin || u.role === 'admin'),
    blocked: !!u.blocked,
  };
}

/** Проверка пароля: bcrypt → фолбэк на plaintext (если исторически так хранится) */
async function verifyPassword(user, password) {
  const hash = user.passwordHash || user.password || '';
  if (!hash) return false;

  const looksHashed = typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
  if (looksHashed) {
    try { return await bcrypt.compare(password, hash); }
    catch { return false; }
  }
  // fallback (не рекомендуется, но не ломаем старые записи)
  return String(hash) === String(password);
}

/**
 * POST /auth/login
 * Body: { email, password }
 * Ответ: { accessToken, token, user }
 * + Заголовки: Authorization: Bearer <token>, X-Auth-Token: <token>
 */
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Ищем пользователя
    const user = await db().collection('users').findOne(
      { email },
      { projection: { name: 1, email: 1, avatar: 1, blocked: 1, role: 1, isAdmin: 1, password: 1, passwordHash: 1, createdAt: 1 } }
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.blocked) return res.status(403).json({ error: 'User is blocked' });

    // Проверяем пароль
    const ok = await verifyPassword(user, password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // JWT (важно: поля — обычные, ожидаемые мидлварью requireAuth)
    const payload = {
      _id: String(user._id),
      email: user.email,
      role: user.role || (user.isAdmin ? 'admin' : 'user'),
      isAdmin: !!(user.isAdmin || user.role === 'admin'),
    };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // Совместимость: продублируем токен в заголовки
    res.setHeader('Authorization', `Bearer ${accessToken}`);
    res.setHeader('X-Auth-Token', accessToken);

    // (опционально) httpOnly-cookie — не мешает JWT-схеме
    try {
      res.cookie('token', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    } catch {}

    return res.json({
      accessToken,
      token: accessToken,
      user: toClientUser(user),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
