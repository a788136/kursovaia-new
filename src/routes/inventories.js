// routes/inventories.js
import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const db = () => mongoose.connection.db;

/* ------------ helpers (твои + расширение) ------------ */
function toObjectId(id) {
  if (typeof id === 'string' && mongoose.isValidObjectId(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return null;
}
function normalizeTags(arr) {
  if (!Array.isArray(arr)) return [];
  const uniq = new Set(
    arr.map((t) => String(t ?? '').trim().toLowerCase()).filter(Boolean)
  );
  return Array.from(uniq);
}
function canEdit(user, doc) {
  if (!user) return false;
  if (user.isAdmin || user.role === 'admin') return true;
  return String(doc.owner_id) === String(user._id);
}
function isAdmin(user) {
  return !!(user && (user.isAdmin || user.role === 'admin'));
}
function requireAdmin(req, res, next) {
  return requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Forbidden' });
    return next();
  });
}
async function hasWriteAccess(userId, invId) {
  if (!userId || !invId) return false;
  const row = await db().collection('inventoryaccesses').findOne({
    inventoryId: invId,
    userId: userId,
    accessType: 'write',
  });
  return !!row;
}
async function canWriteInventory(user, invDocOrId) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const invId = invDocOrId?._id ? invDocOrId._id : invDocOrId;
  const id = invId && toObjectId(invId);
  if (!id) return false;
  const inv = invDocOrId?._id ? invDocOrId : await db().collection('inventories').findOne({ _id: id }, { projection: { owner_id: 1 } });
  if (!inv) return false;
  if (String(inv.owner_id) === String(user._id)) return true;
  return hasWriteAccess(toObjectId(user._id) ?? user._id, id);
}

// Нормализованный ответ для списка (AllInventories)
function toClientLite(inv) {
  return {
    _id: String(inv._id),
    name: inv.name || inv.title || 'Без названия',
    description: inv.description || '',
    cover: inv.cover || inv.image || null,
    tags: Array.isArray(inv.tags) ? inv.tags : [],
    owner: inv.owner ?? null,
    owner_id: inv.owner_id ?? (typeof inv.owner === 'string' ? inv.owner : undefined),
    createdAt: inv.createdAt ?? inv.created_at ?? null,
    updatedAt: inv.updatedAt ?? inv.updated_at ?? null,
  };
}

// Нормализованный ответ для детальной страницы (InventoryDetails.jsx)
function toClientFull(inv) {
  return {
    _id: String(inv._id),
    name: inv.name || inv.title || '',
    description: inv.description || '',
    category: inv.category || null,
    cover: inv.cover || inv.image || null,
    tags: Array.isArray(inv.tags) ? inv.tags : [],
    customIdFormat: inv.customIdFormat ?? inv.custom_id_format ?? null,
    fields: Array.isArray(inv.fields) ? inv.fields : [],
    access: (inv.access && typeof inv.access === 'object') ? inv.access : {},
    stats: (inv.stats && typeof inv.stats === 'object') ? inv.stats : {},
    owner: inv.owner ?? null,
    owner_id: inv.owner_id ?? (typeof inv.owner === 'string' ? inv.owner : undefined),
    createdAt: inv.createdAt ?? inv.created_at ?? null,
    updatedAt: inv.updatedAt ?? inv.updated_at ?? null,
  };
}

/* ====== ВАЛИДАТОРЫ (ШАГ 5) для fields[] и customIdFormat ====== */
function validateFieldDef(f) {
  if (!f || typeof f !== 'object') return 'field must be an object';
  const key = String(f.key || '').trim();
  const label = String(f.label || '').trim();
  const type = String(f.type || '').trim(); // text|number|date|select|checkbox|...

  if (!key) return 'field.key is required';
  if (!/^[a-zA-Z0-9_\-]+$/.test(key)) return 'field.key must be alphanumeric/underscore/dash';
  if (!label) return 'field.label is required';
  if (!type) return 'field.type is required';

  if (type === 'select' && !Array.isArray(f.options)) {
    return 'field.options must be an array for type=select';
  }
  if (type === 'number') {
    if (f.min != null && typeof f.min !== 'number') return 'field.min must be number';
    if (f.max != null && typeof f.max !== 'number') return 'field.max must be number';
  }
  return null;
}
function validateFieldsArray(fields) {
  if (!Array.isArray(fields)) return 'fields must be an array';
  const keys = new Set();
  for (const f of fields) {
    const err = validateFieldDef(f);
    if (err) return err;
    const k = String(f.key).trim().toLowerCase();
    if (keys.has(k)) return `duplicate field key: ${f.key}`;
    keys.add(k);
  }
  return null;
}
function validateCustomIdFormat(cfg) {
  if (cfg == null) return null; // разрешаем null
  if (typeof cfg !== 'object') return 'customIdFormat must be an object';
  if (!Array.isArray(cfg.elements)) return 'customIdFormat.elements must be an array';

  for (const el of cfg.elements) {
    if (!el || typeof el !== 'object') return 'element must be an object';
    const type = String(el.type || '').trim();
    if (!type) return 'element.type is required';

    if (type === 'text') {
      if (typeof el.value !== 'string') return 'text.value must be string';
    } else if (type === 'date') {
      if (typeof el.format !== 'string' || !el.format) return 'date.format is required';
    } else if (type === 'seq') {
      if (el.pad != null && (typeof el.pad !== 'number' || el.pad < 0)) return 'seq.pad must be >=0';
      if (el.scope && !['global', 'inventory'].includes(el.scope)) return 'seq.scope must be "global" or "inventory"';
    } else if (type === 'field') {
      if (typeof el.key !== 'string' || !el.key) return 'field.key is required for element.type=field';
    } else {
      return `unsupported element.type: ${type}`;
    }
  }
  if (cfg.separator != null && typeof cfg.separator !== 'string') {
    return 'customIdFormat.separator must be string';
  }
  if (cfg.enabled != null && typeof cfg.enabled !== 'boolean') {
    return 'customIdFormat.enabled must be boolean';
  }
  return null;
}

/* ======================================================================
   PUBLIC: HomePage endpoints
   ====================================================================== */

router.get('/inventories/latest', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const pipeline = [
      {
        $addFields: {
          sortKey: {
            $ifNull: [
              '$updated_at',
              { $ifNull: ['$updatedAt', { $ifNull: ['$created_at', '$createdAt'] }] }
            ]
          }
        }
      },
      { $sort: { sortKey: -1, _id: -1 } },
      { $limit: limit }
    ];

    const raw = await db().collection('inventories').aggregate(pipeline).toArray();
    const items = raw.map(toClientLite);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/inventories/top', async (_req, res, next) => {
  try {
    const pipeline = [
      {
        $addFields: {
          invIdRaw: { $ifNull: ['$inventory_id', { $ifNull: ['$inventoryId', '$inventory'] }] }
        }
      },
      {
        $addFields: {
          invId: {
            $cond: [
              { $eq: [{ $type: '$invIdRaw' }, 'string'] },
              { $toObjectId: '$invIdRaw' },
              '$invIdRaw'
            ]
          }
        }
      },
      { $match: { invId: { $exists: true, $ne: null } } },
      { $group: { _id: '$invId', itemsCount: { $sum: 1 } } },
      { $sort: { itemsCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'inventories',
          localField: '_id',
          foreignField: '_id',
          as: 'inventory'
        }
      },
      { $unwind: '$inventory' },
      { $replaceRoot: { newRoot: { $mergeObjects: ['$$ROOT', '$inventory'] } } },
      { $project: { itemsCount: 1, _id: 1, title: 1, name: 1, description: 1, image: 1, cover: 1, tags: 1, owner_id: 1, createdAt: 1, updatedAt: 1 } }
    ];

    const raw = await db().collection('items').aggregate(pipeline).toArray();
    const top = raw.map((doc) => toClientLite({ ...doc, _id: doc._id }));
    res.json(top);
  } catch (err) {
    next(err);
  }
});

router.get('/tags', async (_req, res, next) => {
  try {
    const pipeline = [
      { $project: { tags: 1 } },
      { $unwind: '$tags' },
      { $addFields: { tagNorm: { $toLower: '$tags' } } },
      { $group: { _id: '$tagNorm' } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, tag: '$_id' } }
    ];

    const tags = await db().collection('inventories').aggregate(pipeline).toArray();
    res.json(tags.map((t) => t.tag));
  } catch (err) {
    next(err);
  }
});

/* ======================================================================
   CRUD: /inventories
   ====================================================================== */

router.get('/inventories', async (req, res, next) => {
  try {
    const { owner, q, tag, category, limit = '20', page = '1', access } = req.query;

    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const pg = Math.max(parseInt(page, 10) || 1, 1);

    const filter = {};

    // NEW: фильтр по write-доступам
    if (access === 'write') {
      try {
        await new Promise((resolve, reject) =>
          requireAuth(req, res, (err) => (err ? reject(err) : resolve()))
        );
        const uid = toObjectId(req.user?._id) ?? req.user?._id;
        if (!uid) return res.status(401).json({ error: 'Unauthorized' });

        const rows = await db().collection('inventoryaccesses')
          .find({ userId: uid, accessType: 'write' }, { projection: { inventoryId: 1 } })
          .toArray();
        const invIds = rows.map(r => r.inventoryId).filter(Boolean);
        if (!invIds.length) return res.json({ page: pg, limit: lim, total: 0, items: [] });
        filter._id = { $in: invIds };
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else if (owner === 'me') {
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

    const updated = await db().collection('inventories').findOne({ _id: id });
    return res.json(toClientFull(updated));
  } catch (err) {
    next(err);
  }
});

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

/* ======================================================================
   ШАГ 5: кастомные поля и Custom ID
   ====================================================================== */

router.get('/inventories/:id/fields', async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne(
      { _id: id },
      { projection: { fields: 1 } }
    );
    if (!inv) return res.status(404).json({ error: 'Not found' });

    res.json({ fields: Array.isArray(inv.fields) ? inv.fields : [] });
  } catch (err) {
    next(err);
  }
});

router.put('/inventories/:id/fields', requireAuth, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: id });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(req.user, inv)) return res.status(403).json({ error: 'Forbidden' });

    const fields = req.body?.fields;
    const err = validateFieldsArray(fields);
    if (err) return res.status(400).json({ error: err });

    await db().collection('inventories').updateOne(
      { _id: id },
      { $set: { fields, updatedAt: new Date() } }
    );

    const updated = await db().collection('inventories').findOne(
      { _id: id },
      { projection: { fields: 1 } }
    );
    res.json({ fields: Array.isArray(updated.fields) ? updated.fields : [] });
  } catch (err) {
    next(err);
  }
});

router.get('/inventories/:id/customIdFormat', async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne(
      { _id: id },
      { projection: { customIdFormat: 1 } }
    );
    if (!inv) return res.status(404).json({ error: 'Not found' });

    res.json({ customIdFormat: inv.customIdFormat ?? null });
  } catch (err) {
    next(err);
  }
});

router.put('/inventories/:id/customIdFormat', requireAuth, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: id });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(req.user, inv)) return res.status(403).json({ error: 'Forbidden' });

    const cfg = req.body?.customIdFormat ?? null;
    const err = validateCustomIdFormat(cfg);
    if (err) return res.status(400).json({ error: err });

    await db().collection('inventories').updateOne(
      { _id: id },
      { $set: { customIdFormat: cfg, updatedAt: new Date() } }
    );

    const updated = await db().collection('inventories').findOne(
      { _id: id },
      { projection: { customIdFormat: 1 } }
    );
    res.json({ customIdFormat: updated.customIdFormat ?? null });
  } catch (err) {
    next(err);
  }
});

/* ======================================================================
   DISCUSSION (Chat)
   ====================================================================== */

router.get('/inventories/:id/discussion', async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const lim = Math.max(1, Math.min(+(req.query.limit || 200), 500));
    const after = req.query.after ? new Date(req.query.after) : null;
    if (after && isNaN(after.getTime())) {
      return res.status(400).json({ error: 'Invalid after' });
    }

    const match = after ? { inventoryId: id, createdAt: { $gt: after } } : { inventoryId: id };

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: 1, _id: 1 } },
      { $limit: lim },
      { $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: 'author' } },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          text: 1,
          createdAt: 1,
          author: {
            id: '$author._id',
            name: '$author.name',
            avatar: '$author.avatar',
          },
        }
      }
    ];

    const posts = await db().collection('discussionposts').aggregate(pipeline).toArray();
    const items = posts.map(p => ({
      id: String(p._id),
      inventoryId: String(id),
      text: p.text,
      createdAt: p.createdAt,
      author: {
        id: p.author?.id ? String(p.author.id) : '',
        name: p.author?.name || 'User',
        avatar: p.author?.avatar || '',
      },
    }));
    res.json({ items, count: items.length });
  } catch (err) {
    next(err);
  }
});

router.post('/inventories/:id/discussion', requireAuth, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Text is required' });
    if (text.length > 5000) return res.status(400).json({ error: 'Text too long' });

    const doc = {
      inventoryId: id,
      authorId: toObjectId(req.user._id) ?? req.user._id,
      text,
      createdAt: new Date(),
    };

    const r = await db().collection('discussionposts').insertOne(doc);

    const payload = {
      id: String(r.insertedId),
      inventoryId: String(id),
      text,
      createdAt: doc.createdAt,
      author: {
        id: String(req.user._id),
        name: req.user.name,
        avatar: req.user.avatar || '',
      },
    };

    const io = req.app.get('io');
    if (io) {
      io.to(`inv:${String(id)}`).emit('discussion:new', payload);
    }

    res.status(201).json(payload);
  } catch (err) {
    next(err);
  }
});

/* ======================================================================
   SHAG 9: ACCESS MANAGEMENT
   ====================================================================== */

router.get('/inventories/:id/access', requireAuth, async (req, res, next) => {
  try {
    const invId = toObjectId(req.params.id);
    if (!invId) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: invId });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(req.user, inv)) return res.status(403).json({ error: 'Forbidden' });

    const ownerUser = await db().collection('users').findOne({ _id: inv.owner_id });
    const owner = ownerUser ? {
      id: String(ownerUser._id),
      name: ownerUser.name || '',
      email: ownerUser.email || '',
      avatar: ownerUser.avatar || '',
      blocked: !!ownerUser.blocked
    } : null;

    const pipeline = [
      { $match: { inventoryId: invId } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          accessType: 1,
          user: {
            id: '$user._id',
            name: '$user.name',
            email: '$user.email',
            avatar: '$user.avatar',
            blocked: '$user.blocked'
          }
        }
      }
    ];

    const rows = await db().collection('inventoryaccesses').aggregate(pipeline).toArray();
    const items = rows.map(r => ({
      accessType: r.accessType,
      user: {
        id: String(r.user.id),
        name: r.user.name || '',
        email: r.user.email || '',
        avatar: r.user.avatar || '',
        blocked: !!r.user.blocked
      }
    }));

    res.json({ owner, items });
  } catch (err) {
    next(err);
  }
});

router.put('/inventories/:id/access', requireAuth, async (req, res, next) => {
  try {
    const invId = toObjectId(req.params.id);
    if (!invId) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: invId });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(req.user, inv)) return res.status(403).json({ error: 'Forbidden' });

    const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
    const remove = Array.isArray(req.body?.remove) ? req.body.remove : [];

    try {
      await db().collection('inventoryaccesses').createIndex({ inventoryId: 1, userId: 1 }, { unique: true });
    } catch { /* ignore */ }

    async function resolveUserId(entry) {
      if (entry.userId && mongoose.isValidObjectId(entry.userId)) return new mongoose.Types.ObjectId(entry.userId);
      if (entry.email) {
        const u = await db().collection('users').findOne({ email: String(entry.email).trim().toLowerCase() });
        return u?._id || null;
      }
      return null;
    }

    const toRemoveIds = [];
    for (const rid of remove) {
      if (!mongoose.isValidObjectId(rid)) continue;
      const oid = new mongoose.Types.ObjectId(rid);
      if (String(oid) === String(inv.owner_id)) continue;
      toRemoveIds.push(oid);
    }
    if (toRemoveIds.length) {
      await db().collection('inventoryaccesses').deleteMany({ inventoryId: invId, userId: { $in: toRemoveIds } });
    }

    for (const ch of changes) {
      const uid = await resolveUserId(ch);
      if (!uid) continue;
      if (String(uid) === String(inv.owner_id)) continue;

      if (!ch.accessType) {
        await db().collection('inventoryaccesses').deleteOne({ inventoryId: invId, userId: uid });
        continue;
      }
      const accessType = ch.accessType === 'write' ? 'write' : 'read';
      await db().collection('inventoryaccesses').updateOne(
        { inventoryId: invId, userId: uid },
        { $set: { inventoryId: invId, userId: uid, accessType, createdAt: new Date() } },
        { upsert: true }
      );
    }

    req.params.id = String(invId);
    return router.handle({ ...req, method: 'GET', url: `/inventories/${invId}/access` }, res, next);
  } catch (err) {
    next(err);
  }
});

/* ======================================================================
   USERS SEARCH (autocomplete)
   ====================================================================== */

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

/* ======================================================================
   ADMIN
   ====================================================================== */

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

/* ======================================================================
   ITEMS (лист/создание) + ITEM details (optimistic locking)
   ====================================================================== */

// Нормализация айтема для клиента
function itemToClient(doc) {
  if (!doc) return null;
  return {
    _id: String(doc._id),
    inventoryId: doc.inventoryId ? String(doc.inventoryId) : null,
    name: doc.name || doc.title || '',
    description: doc.description || '',
    image: doc.image || null,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    fields: doc.fields && typeof doc.fields === 'object' ? doc.fields : {},
    version: typeof doc.version === 'number' ? doc.version : (doc.updatedAt ? new Date(doc.updatedAt).getTime() : 1),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

// GET /inventories/:id/items
router.get('/inventories/:id/items', async (req, res, next) => {
  try {
    const invId = toObjectId(req.params.id);
    if (!invId) return res.status(400).json({ error: 'Invalid id' });

    const { q, limit = '20', page = '1' } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const pg = Math.max(parseInt(page, 10) || 1, 1);

    const filter = { inventoryId: invId };
    if (q) {
      const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { title: rx }, { description: rx }];
    }

    const cursor = db().collection('items')
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((pg - 1) * lim)
      .limit(lim);

    const [rows, total] = await Promise.all([
      cursor.toArray(),
      db().collection('items').countDocuments(filter)
    ]);

    res.json({
      page: pg,
      limit: lim,
      total,
      items: rows.map(itemToClient),
    });
  } catch (err) {
    next(err);
  }
});

// POST /inventories/:id/items
router.post('/inventories/:id/items', requireAuth, async (req, res, next) => {
  try {
    const invId = toObjectId(req.params.id);
    if (!invId) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: invId });
    if (!inv) return res.status(404).json({ error: 'Inventory not found' });
    if (!(await canWriteInventory(req.user, inv))) return res.status(403).json({ error: 'Forbidden' });

    const body = req.body || {};
    const name = (body.name ?? body.title ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const itemDoc = {
      inventoryId: invId,
      name,
      description: String(body.description || ''),
      image: String(body.image || ''),
      tags: normalizeTags(body.tags),
      fields: (body.fields && typeof body.fields === 'object') ? body.fields : {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const r = await db().collection('items').insertOne(itemDoc);
    const saved = await db().collection('items').findOne({ _id: r.insertedId });
    res.status(201).json(itemToClient(saved));
  } catch (err) {
    next(err);
  }
});

// GET /items/:itemId
router.get('/items/:itemId', async (req, res, next) => {
  try {
    const itemId = toObjectId(req.params.itemId);
    if (!itemId) return res.status(400).json({ error: 'Invalid id' });
    const doc = await db().collection('items').findOne({ _id: itemId });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(itemToClient(doc));
  } catch (err) {
    next(err);
  }
});

// PUT /items/:itemId  (optimistic locking по version)
router.put('/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const itemId = toObjectId(req.params.itemId);
    if (!itemId) return res.status(400).json({ error: 'Invalid id' });

    const cur = await db().collection('items').findOne({ _id: itemId }, { projection: { inventoryId: 1, version: 1 } });
    if (!cur) return res.status(404).json({ error: 'Not found' });

    const inv = await db().collection('inventories').findOne({ _id: cur.inventoryId }, { projection: { owner_id: 1 } });
    if (!inv) return res.status(404).json({ error: 'Inventory not found' });
    if (!(await canWriteInventory(req.user, inv))) return res.status(403).json({ error: 'Forbidden' });

    const clientVersion = Number.isInteger(req.body?.version) ? req.body.version : null;
    if (clientVersion == null) {
      return res.status(400).json({ error: 'version is required for optimistic locking' });
    }

    const allowed = {};
    if ('name' in req.body) allowed.name = String(req.body.name || '');
    if ('title' in req.body && !('name' in req.body)) allowed.name = String(req.body.title || '');
    if ('description' in req.body) allowed.description = String(req.body.description || '');
    if ('image' in req.body) allowed.image = String(req.body.image || '');
    if ('tags' in req.body) allowed.tags = normalizeTags(req.body.tags);
    if ('fields' in req.body && typeof req.body.fields === 'object') allowed.fields = req.body.fields;

    allowed.updatedAt = new Date();

    const upd = await db().collection('items').findOneAndUpdate(
      { _id: itemId, version: clientVersion },
      { $set: allowed, $inc: { version: 1 } },
      { returnDocument: 'after' }
    );

    if (!upd.value) {
      const fresh = await db().collection('items').findOne({ _id: itemId });
      return res.status(409).json({ error: 'Version conflict', current: itemToClient(fresh) });
    }

    res.json(itemToClient(upd.value));
  } catch (err) {
    next(err);
  }
});

// DELETE /items/:itemId
router.delete('/items/:itemId', requireAuth, async (req, res, next) => {
  try {
    const itemId = toObjectId(req.params.itemId);
    if (!itemId) return res.status(400).json({ error: 'Invalid id' });

    const cur = await db().collection('items').findOne({ _id: itemId }, { projection: { inventoryId: 1 } });
    if (!cur) return res.status(404).json({ error: 'Not found' });

    const inv = await db().collection('inventories').findOne({ _id: cur.inventoryId }, { projection: { owner_id: 1 } });
    if (!inv) return res.status(404).json({ error: 'Inventory not found' });
    if (!(await canWriteInventory(req.user, inv))) return res.status(403).json({ error: 'Forbidden' });

    await db().collection('items').deleteOne({ _id: itemId });
    res.json({ ok: true, _id: String(itemId) });
  } catch (err) {
    next(err);
  }
});

/* ======================================================================
   SEARCH (глобальный поиск по инвентарям и айтемам)
   ====================================================================== */

// Простой фолбэк-поиск regex (если нет text-индексов)
function buildTextFilter(q, fields) {
  const rx = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return { $or: fields.map(f => ({ [f]: rx })) };
}

// GET /search?q=&type=all|inventories|items&limit=&page=
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const type = (String(req.query.type || 'all').toLowerCase());
    const lim = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const pg = Math.max(parseInt(req.query.page, 10) || 1, 1);

    if (!q) return res.status(400).json({ error: 'q is required' });

    const wantInv = type === 'all' || type === 'inventories';
    const wantItems = type === 'all' || type === 'items';

    const out = { q, type, page: pg, limit: lim };

    if (wantInv) {
      const filterInv = buildTextFilter(q, ['title', 'description', 'name', 'tags']);
      const [docs, total] = await Promise.all([
        db().collection('inventories')
          .find(filterInv, { projection: { title: 1, description: 1, image: 1, tags: 1, updatedAt: 1 } })
          .sort({ updatedAt: -1, _id: -1 }).skip((pg - 1) * lim).limit(lim).toArray(),
        db().collection('inventories').countDocuments(filterInv)
      ]);
      out.inventories = {
        total,
        items: docs.map(toClientLite)
      };
    }

    if (wantItems) {
      const filterIt = buildTextFilter(q, ['name', 'title', 'description', 'tags']);
      const [docs, total] = await Promise.all([
        db().collection('items')
          .find(filterIt, { projection: { name: 1, description: 1, image: 1, tags: 1, inventoryId: 1, updatedAt: 1, version: 1 } })
          .sort({ updatedAt: -1, _id: -1 }).skip((pg - 1) * lim).limit(lim).toArray(),
        db().collection('items').countDocuments(filterIt)
      ]);
      out.items = {
        total,
        items: docs.map(itemToClient)
      };
    }

    res.json(out);
  } catch (err) {
    next(err);
  }
});

export default router;
