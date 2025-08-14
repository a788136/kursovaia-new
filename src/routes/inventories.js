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
/**
 * customIdFormat пример:
 * {
 *   "enabled": true,
 *   "separator": "-",
 *   "elements": [
 *     { "type": "text", "value": "INV" },
 *     { "type": "date", "format": "YYYYMM" },
 *     { "type": "field", "key": "brand" },
 *     { "type": "seq", "pad": 4, "scope": "inventory" } // "global"|"inventory"
 *   ]
 * }
 */
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

/**
 * GET /inventories/latest?limit=10
 */
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

/**
 * GET /inventories/top — топ-5 по количеству items
 */
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

/**
 * GET /tags — уникальные теги
 */
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
   Храним: owner_id, title, description, image, tags[], category, fields[], customIdFormat, access, stats
   ====================================================================== */

/**
 * GET /inventories
 * Квери: owner=me|<ownerId>, q, tag, category, limit, page
 * Публичный (чтение для всех).
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
 * Публично: возвращаем полный объект, который ждёт InventoryDetails.jsx.
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
 * Требуется JWT. owner_id берём из токена.
 * Принимаем name|title и cover|image; нормализуем в title/image в базе.
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
      image, // в базе хранится image; на выдаче -> cover
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
 * Разрешено владельцу или админу. Поддерживаем алиасы name/cover.
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
 * Разрешено владельцу или админу.
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

/* ======================================================================
   ШАГ 5: кастомные поля и Custom ID
   ====================================================================== */

/**
 * GET /inventories/:id/fields
 * Публично: вернуть массив полей (для вкладки Fields)
 */
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

/**
 * PUT /inventories/:id/fields
 * Требует право редактирования. Body: { fields: FieldDef[] }
 */
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

/**
 * GET /inventories/:id/customIdFormat
 * Публично: вернуть текущую схему customIdFormat
 */
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

/**
 * PUT /inventories/:id/customIdFormat
 * Требует право редактирования. Body: { customIdFormat: {...} }
 */
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

export default router;
