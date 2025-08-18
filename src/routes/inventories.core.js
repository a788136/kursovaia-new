// routes/inventories.core.js
import { Router } from 'express';
import { db, toObjectId, normalizeTags, toClientLite, toClientFull, requireAuth, canEdit } from './_shared.js';

const router = Router();

/**
 * GET /inventories
 */
router.get('/inventories', async (req, res, next) => {
  try {
    const { owner, q, tag, category, limit = '20', page = '1' } = req.query;

    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const pg = Math.max(parseInt(page, 10) || 1, 1);

    const filter = {};
    if (owner === 'me') {
      // «мягкая» проверка токена
      try {
        await new Promise((resolve, reject) =>
          requireAuth(req, res, (err) => (err ? reject(err) : resolve()))
        );
        const uid = toObjectId(req.user?._id) ?? req.user?._id;
        if (!uid) return res.status(401).json({ error: 'Unauthorized' });
        filter.owner_id = uid;
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else if (owner) {
      filter.owner_id = toObjectId(owner) ?? owner;
    }

    if (category) filter.category = String(category).trim();
    if (tag) filter.tags = String(tag).trim().toLowerCase();

    if (q) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { name: rx }];
    }

    const cursor = db()
      .collection('inventories')
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((pg - 1) * lim)
      .limit(lim);

    const [docs, total] = await Promise.all([
      cursor.toArray(),
      db().collection('inventories').countDocuments(filter)
    ]);

    const items = docs.map(toClientLite);
    res.json({ page: pg, limit: lim, total, items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /inventories/:id
 */
router.get('/inventories/:id', async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: id });
    if (!inv) return res.status(404).json({ error: 'Not found' });

    return res.json(toClientFull(inv));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /inventories
 */
router.post('/inventories', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const title = (body.title ?? body.name ?? '').trim();
    const description = (body.description ?? '').trim();
    const category = (body.category ?? '').trim();
    const image = (body.image ?? body.cover ?? '').trim();
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const isPublic = !!body.isPublic;
    const fields = Array.isArray(body.fields) ? body.fields : [];
    const customIdFormat = body.customIdFormat ?? null;
    const access = (body.access && typeof body.access === 'object') ? body.access : {};
    const stats = (body.stats && typeof body.stats === 'object') ? body.stats : {};

    if (!title) return res.status(400).json({ error: 'Title is required' });

    const doc = {
      owner_id: toObjectId(req.user._id) ?? req.user._id,
      title,
      description,
      category,
      image,
      tags: normalizeTags(tags),
      isPublic,
      fields,
      customIdFormat,
      access,
      stats,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db().collection('inventories').insertOne(doc);
    const saved = await db().collection('inventories').findOne({ _id: result.insertedId });

    return res.status(201).json(toClientFull(saved));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /inventories/:id
 */
router.put('/inventories/:id', requireAuth, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: id });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(req.user, inv)) return res.status(403).json({ error: 'Forbidden' });

    const $set = { updatedAt: new Date() };

    // основной набор полей
    if ('title' in req.body) $set.title = String(req.body.title || '').trim();
    if ('description' in req.body) $set.description = String(req.body.description || '').trim();
    if ('category' in req.body) $set.category = String(req.body.category || '').trim();
    if ('image' in req.body) $set.image = String(req.body.image || '').trim();
    if ('tags' in req.body) $set.tags = normalizeTags(req.body.tags);
    if ('isPublic' in req.body) $set.isPublic = !!req.body.isPublic;
    if ('fields' in req.body) $set.fields = Array.isArray(req.body.fields) ? req.body.fields : [];
    if ('customIdFormat' in req.body) $set.customIdFormat = req.body.customIdFormat ?? null;
    if ('access' in req.body && typeof req.body.access === 'object') $set.access = req.body.access;
    if ('stats' in req.body && typeof req.body.stats === 'object') $set.stats = req.body.stats;

    // алиасы с фронта
    if ('name' in req.body && !('title' in req.body)) $set.title = String(req.body.name || '').trim();
    if ('cover' in req.body && !('image' in req.body)) $set.image = String(req.body.cover || '').trim();

    await db().collection('inventories').updateOne({ _id: id }, { $set });

    const updated = await db().collection('inventories').findOne({ _id: id });
    return res.json(toClientFull(updated));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /inventories/:id
 */
router.delete('/inventories/:id', requireAuth, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: id });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(req.user, inv)) return res.status(403).json({ error: 'Forbidden' });

    await db().collection('inventories').deleteOne({ _id: id });
    res.json({ ok: true, _id: String(id) });
  } catch (err) {
    next(err);
  }
});

export default router;
