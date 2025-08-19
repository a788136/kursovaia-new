// src/routes/auth-local.js
import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loadEnv } from '../config/env.js';

const router = Router();
const db = () => mongoose.connection.db;
const { JWT_SECRET = 'dev_secret', NODE_ENV } = loadEnv();

/**
 * POST /auth/login
 * Body: { email, password }
 * Ответ: { accessToken, user }
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
      { projection: { name: 1, email: 1, avatar: 1, blocked: 1, role: 1, isAdmin: 1, password: 1, passwordHash: 1 } }
    );

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.blocked) return res.status(403).json({ error: 'User is blocked' });

    // Проверяем пароль
    const hash = user.passwordHash || user.password || '';
    const ok = hash && hash.length > 0 ? await bcrypt.compare(password, hash) : false;
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // JWT
    const payload = {
      sub: String(user._id),
      email: user.email,
      name: user.name || '',
      role: user.role || (user.isAdmin ? 'admin' : 'user'),
      isAdmin: !!user.isAdmin,
    };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // Опционально: ставим httpOnly cookie (не обязательно, но полезно)
    try {
      res.cookie('token', accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    } catch (_) {}

    return res.json({
      accessToken,
      user: {
        id: String(user._id),
        name: user.name || '',
        email: user.email || '',
        avatar: user.avatar || '',
        role: user.role || (user.isAdmin ? 'admin' : 'user'),
        isAdmin: !!user.isAdmin,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
