// routes/users.search.js
import { Router } from 'express';
import { db, requireAuth } from './_shared.js';

const router = Router();

/**
 * GET /users/search?q=term&limit=10
 */
router.get('/users/search', requireAuth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const lim = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    if (!q) return res.json([]);

    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const users = await db().collection('users')
      .find({ $or: [{ email: rx }, { name: rx }] }, { projection: { name: 1, email: 1, avatar: 1, blocked: 1 } })
      .limit(lim)
      .toArray();

    const items = users.map(u => ({
      id: String(u._id),
      name: u.name || '',
      email: u.email || '',
      avatar: u.avatar || '',
      blocked: !!u.blocked
    }));
    res.json(items);
  } catch (err) {
    next(err);
  }
});

export default router;
