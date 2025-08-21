// routes/users.js
import { Router } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, toObjectId } from './_shared.js';

const router = Router();

/** GET /users/me (JWT required) — как у тебя было */
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user.toClient());
});

/**
 * GET /users/search?q=&limit=
 * Доступно авторизованным (используется в автокомплите)
 * Возвращает { items: [{id,name,email,avatar,blocked,role}] }
 */
router.get('/users/search', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 25);

    const filter = q
      ? {
          $or: [
            { email: { $regex: q, $options: 'i' } },
            { name:  { $regex: q, $options: 'i' } },
            { firstName: { $regex: q, $options: 'i' } },
            { lastName:  { $regex: q, $options: 'i' } },
          ],
        }
      : {};

    const users = await User.find(
      filter,
      { name: 1, email: 1, avatar: 1, blocked: 1, isBlocked: 1, role: 1, isAdmin: 1 }
    )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const items = users.map((u) => ({
      id: String(u._id),
      name: u.name || '',
      email: u.email || '',
      avatar: u.avatar || '',
      blocked: !!u.blocked || !!u.isBlocked,
      role: u.role || (u.isAdmin ? 'admin' : 'user'),
    }));

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /users/:id
 * Только админ — для просмотра карточки пользователя/его текущей роли
 * Возвращает { user: {...} }
 */
router.get('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ error: 'Not found' });

    res.json({
      user: {
        _id: String(user._id),
        name: user.name || '',
        email: user.email || '',
        avatar: user.avatar || '',
        blocked: !!user.blocked || !!user.isBlocked,
        role: user.role || (user.isAdmin ? 'admin' : 'user'),
        isAdmin: !!user.isAdmin,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /users/:id/role
 * Только админ может назначать/снимать глобальную роль admin
 * Body: { role: 'user' | 'admin' }
 * Возвращает { ok:true, user:{...} }
 */
router.put('/users/:id/role', requireAdmin, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const role = String(req.body?.role || '').toLowerCase();
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be "user" or "admin"' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Not found' });

    user.role = role;
    // для обратной совместимости, если где-то проверяется isAdmin
    user.isAdmin = role === 'admin';

    await user.save();

    res.json({
      ok: true,
      user: {
        _id: String(user._id),
        name: user.name || '',
        email: user.email || '',
        avatar: user.avatar || '',
        blocked: !!user.blocked || !!user.isBlocked,
        role: user.role,
        isAdmin: !!user.isAdmin,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
