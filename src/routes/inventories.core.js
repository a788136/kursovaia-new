// routes/inventories.core.js
import { Router } from 'express';
import {
  db,
  toObjectId,
  normalizeTags,
  toClientLite,
  toClientFull,
  requireAuth,
  canEdit,
} from './_shared.js';

const router = Router();

/* ---------- ВСПОМОГАТЕЛЬНО: правила доступа ---------- */
function buildAccessWriteOr(uid) {
  const or = [];
  const uidStr = String(uid);

  // владелец = всегда write
  or.push({ owner_id: toObjectId(uidStr) ?? uidStr });

  // форма "map": access.<userId> = 'write' | true | 1 | 2
  or.push({ [`access.${uidStr}`]: 'write' });
  or.push({ [`access.${uidStr}`]: true });
  or.push({ [`access.${uidStr}`]: 1 });
  or.push({ [`access.${uidStr}`]: 2 });

  // форма "array": access: [{ userId/user_id/id, accessType }]
  for (const k of ['userId', 'user_id', 'id']) {
    or.push({ access: { $elemMatch: { [k]: toObjectId(uidStr) ?? uidStr, accessType: 'write' } } });
    or.push({ 'access.users': { $elemMatch: { [k]: toObjectId(uidStr) ?? uidStr, accessType: 'write' } } });
  }
  return or;
}

function buildAccessReadOr(uid) {
  const or = buildAccessWriteOr(uid); // write включает owner
  const uidStr = String(uid);

  // дополнительно read
  or.push({ [`access.${uidStr}`]: 'read' });
  for (const k of ['userId', 'user_id', 'id']) {
    or.push({ access: { $elemMatch: { [k]: toObjectId(uidStr) ?? uidStr, accessType: 'read' } } });
    or.push({ 'access.users': { $elemMatch: { [k]: toObjectId(uidStr) ?? uidStr, accessType: 'read' } } });
  }
  return or;
}

/**
 * GET /inventories
 * Параметры:
 * - owner=me | <userId>
 * - access=write|read (JWT обязателен)
 * - q / tag / category
 * - page / limit
 * Всегда подтягиваем автора ($lookup), форматируем через toClientLite.
 */
router.get('/inventories', async (req, res, next) => {
  try {
    const { owner, q, tag, category, access, limit = '20', page = '1' } = req.query;

    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const pg = Math.max(parseInt(page, 10) || 1, 1);

    const filter = {};

    // --- owner ---
    if (owner === 'me') {
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

    // --- category / tag / q ---
    if (category) filter.category = String(category).trim();
    if (tag) filter.tags = String(tag).trim().toLowerCase();
    if (q) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { name: rx }];
    }

    // --- access ---
    if (access === 'write' || access === 'read') {
      try {
        await new Promise((resolve, reject) =>
          requireAuth(req, res, (err) => (err ? reject(err) : resolve()))
        );
        const uid = req.user?._id;
        if (!uid) return res.status(401).json({ error: 'Unauthorized' });

        const aclOr = access === 'write' ? buildAccessWriteOr(uid) : buildAccessReadOr(uid);

        // накладываем с остальными фильтрами
        if (filter.$or) {
          const prevOr = filter.$or;
          delete filter.$or;
          filter.$and = [...(filter.$and || []), { $or: prevOr }, { $or: aclOr }];
        } else {
          filter.$and = [...(filter.$and || []), { $or: aclOr }];
        }
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const total = await db().collection('inventories').countDocuments(filter);

    const docs = await db()
      .collection('inventories')
      .aggregate([
        { $match: filter },
        { $sort: { updatedAt: -1, _id: -1 } },
        { $skip: (pg - 1) * lim },
        { $limit: lim },
        {
          $lookup: {
            from: 'users',
            localField: 'owner_id',
            foreignField: '_id',
            as: 'ownerUser',
          },
        },
        { $unwind: { path: '$ownerUser', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            owner: {
              id: '$ownerUser._id',
              name: '$ownerUser.name',
              email: '$ownerUser.email',
              avatar: '$ownerUser.avatar',
            },
          },
        },
        { $project: { ownerUser: 0 } },
      ])
      .toArray();

    const items = docs.map(toClientLite);
    res.json({ page: pg, limit: lim, total, items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /inventories/:id
 * Публично; $lookup автора.
 */
router.get('/inventories/:id', async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const rows = await db()
      .collection('inventories')
      .aggregate([
        { $match: { _id: id } },
        {
          $lookup: {
            from: 'users',
            localField: 'owner_id',
            foreignField: '_id',
            as: 'ownerUser',
          },
        },
        { $unwind: { path: '$ownerUser', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            owner: {
              id: '$ownerUser._id',
              name: '$ownerUser.name',
              email: '$ownerUser.email',
              avatar: '$ownerUser.avatar',
            },
          },
        },
        { $project: { ownerUser: 0 } },
      ])
      .toArray();

    const inv = rows[0];
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
      updatedAt: new Date(),
    };

    const result = await db().collection('inventories').insertOne(doc);

    const savedRows = await db()
      .collection('inventories')
      .aggregate([
        { $match: { _id: result.insertedId } },
        {
          $lookup: {
            from: 'users',
            localField: 'owner_id',
            foreignField: '_id',
            as: 'ownerUser',
          },
        },
        { $unwind: { path: '$ownerUser', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            owner: {
              id: '$ownerUser._id',
              name: '$ownerUser.name',
              email: '$ownerUser.email',
              avatar: '$ownerUser.avatar',
            },
          },
        },
        { $project: { ownerUser: 0 } },
      ])
      .toArray();

    const saved = savedRows[0];
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

    if ('name' in req.body && !('title' in req.body)) $set.title = String(req.body.name || '').trim();
    if ('cover' in req.body && !('image' in req.body)) $set.image = String(req.body.cover || '').trim();

    await db().collection('inventories').updateOne({ _id: id }, { $set });

    const updatedRows = await db()
      .collection('inventories')
      .aggregate([
        { $match: { _id: id } },
        {
          $lookup: {
            from: 'users',
            localField: 'owner_id',
            foreignField: '_id',
            as: 'ownerUser',
          },
        },
        { $unwind: { path: '$ownerUser', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            owner: {
              id: '$ownerUser._id',
              name: '$ownerUser.name',
              email: '$ownerUser.email',
              avatar: '$ownerUser.avatar',
            },
          },
        },
        { $project: { ownerUser: 0 } },
      ])
      .toArray();

    const updated = updatedRows[0];
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
