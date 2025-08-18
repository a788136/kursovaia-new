// src/routes/auth-local.js
import { Router } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();
const db = () => mongoose.connection.db;

/** Подписываем JWT совместимо с вашим auth/me */
function signToken(user) {
  const payload = {
    _id: String(user._id),
    email: user.email,
    role: user.role,
    isAdmin: !!(user.isAdmin || user.role === 'admin'),
  };
  const secret = process.env.JWT_SECRET || 'dev_secret';
  const expires = process.env.JWT_EXPIRES_IN || '30d';
  return jwt.sign(payload, secret, { expiresIn: expires });
}

/**
 * POST /auth/login
 * Body: { email, password }
 * Ответ: { token, user, authenticated: true }
 */
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db().collection('users').findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.blocked) return res.status(403).json({ error: 'User is blocked' });

    let ok = false;
    if (user.passwordHash) {
      ok = await bcrypt.compare(password, user.passwordHash);
    } else if (user.password) {
      // fallback для старых записей (небезопасно, но сохраняем совместимость)
      ok = password === user.password;
    }

    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    const userOut = {
      _id: String(user._id),
      email: user.email || email,
      name: user.name || '',
      avatar: user.avatar || '',
      role: user.role || (user.isAdmin ? 'admin' : 'user'),
      isAdmin: !!(user.isAdmin || user.role === 'admin'),
    };

    return res.json({ token, user: userOut, authenticated: true });
  } catch (err) {
    next(err);
  }
});

export default router;
