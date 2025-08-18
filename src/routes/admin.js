// routes/admin.js
import { Router } from 'express';
import { db, toObjectId, requireAdmin } from './_shared.js';

const router = Router();

/**
 * GET /admin/users?q=&page=&limit=
 */
router.get('/admin/users', requireAdmin, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const lim = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const pg = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const filter = {};
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ email: rx }, { name: rx }];
    }

    const cursor = db().collection('users')
      .find(filter, { projection: { name: 1, email: 1, avatar: 1, blocked: 1, role: 1, isAdmin: 1, createdAt: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .skip((pg - 1) * lim)
      .limit(lim);

    const [rows, total] = await Promise.all([
      cursor.toArray(),
      db().collection('users').countDocuments(filter)
    ]);

    const items = rows.map(u => ({
      id: String(u._id),
      name: u.name || '',
      email: u.email || '',
      avatar: u.avatar || '',
      blocked: !!u.blocked,
      isAdmin: !!(u.isAdmin || u.role === 'admin'),
      role: u.role || (u.isAdmin ? 'admin' : 'user'),
      createdAt: u.createdAt || null
    }));

    res.json({ items, total, page: pg, limit: lim });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/users/:id/block { blocked: true|false }
 */
router.patch('/admin/users/:id/block', requireAdmin, async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.id);
    if (!uid) return res.status(400).json({ error: 'Invalid id' });

    const blocked = !!req.body?.blocked;
    await db().collection('users').updateOne({ _id: uid }, { $set: { blocked } });

    const u = await db().collection('users').findOne({ _id: uid }, { projection: { name: 1, email: 1, avatar: 1, blocked: 1, role: 1, isAdmin: 1 } });
    res.json({
      id: String(u._id),
      name: u.name || '',
      email: u.email || '',
      avatar: u.avatar || '',
      blocked: !!u.blocked,
      isAdmin: !!(u.isAdmin || u.role === 'admin'),
      role: u.role || (u.isAdmin ? 'admin' : 'user')
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/users/:id/admin { isAdmin: true|false }
 */
router.patch('/admin/users/:id/admin', requireAdmin, async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.id);
    if (!uid) return res.status(400).json({ error: 'Invalid id' });

    const isAdminNext = !!req.body?.isAdmin;

    const $set = { isAdmin: isAdminNext };
    if (isAdminNext) $set.role = 'admin';
    else {
      const cur = await db().collection('users').findOne({ _id: uid }, { projection: { role: 1 } });
      if (cur?.role === 'admin') $set.role = 'user';
    }

    await db().collection('users').updateOne({ _id: uid }, { $set });

    const u = await db().collection('users').findOne({ _id: uid }, { projection: { name: 1, email: 1, avatar: 1, blocked: 1, role: 1, isAdmin: 1 } });
    res.json({
      id: String(u._id),
      name: u.name || '',
      email: u.email || '',
      avatar: u.avatar || '',
      blocked: !!u.blocked,
      isAdmin: !!(u.isAdmin || u.role === 'admin'),
      role: u.role || (u.isAdmin ? 'admin' : 'user')
    });
  } catch (err) {
    next(err);
  }
});

export default router;
