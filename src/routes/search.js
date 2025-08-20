// routes/search.js
import mongoose from 'mongoose';
import { Router } from 'express';
import { db, buildTextFilter } from './_shared.js';

const router = Router();

/**
 * GET /search?q=&type=all|inventories|items&limit=&page=
 */
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q is required' });

    const type = String(req.query.type || 'all').toLowerCase();
    const lim = Math.max(1, Math.min(parseInt(req.query.limit || '20', 10) || 20, 50));
    const pg  = Math.max(1, parseInt(req.query.page || '1', 10) || 1);

    const wantInv   = type === 'all' || type === 'inventories';
    const wantItems = type === 'all' || type === 'items';

    const out = { q, type, page: pg, limit: lim };

    // ----- Инвентаризации -----
    if (wantInv) {
      const filterInv = buildTextFilter(q, ['title', 'name', 'description', 'tags']);

      // В проекции берём owner/owner_id, чтобы потом подтянуть профиль пользователя
      const projectionInv = {
        title: 1,
        name: 1,
        description: 1,
        image: 1,
        tags: 1,
        owner: 1,
        owner_id: 1,
        updatedAt: 1,
        createdAt: 1,
      };

      const [docs, total] = await Promise.all([
        db().collection('inventories')
          .find(filterInv, { projection: projectionInv })
          .sort({ updatedAt: -1, _id: -1 })
          .skip((pg - 1) * lim)
          .limit(lim)
          .toArray(),
        db().collection('inventories').countDocuments(filterInv),
      ]);

      // Собираем уникальные ownerId для батч-запроса в users
      const ownerIdStrings = Array.from(new Set(docs.map((doc) => {
        const raw = doc.owner_id ?? doc.owner ?? null;
        if (!raw) return null;
        if (typeof raw === 'string') return raw;
        if (raw instanceof mongoose.Types.ObjectId) return String(raw);
        if (typeof raw === 'object' && raw._id) return String(raw._id);
        return null;
      }).filter(Boolean)));

      let usersMap = new Map();
      if (ownerIdStrings.length) {
        const userIds = ownerIdStrings
          .filter((id) => mongoose.isValidObjectId(id))
          .map((id) => new mongoose.Types.ObjectId(id));

        if (userIds.length) {
          const users = await db().collection('users')
            .find(
              { _id: { $in: userIds } },
              { projection: { name: 1, firstName: 1, lastName: 1 } }
            )
            .toArray();

          users.forEach((u) => {
            const full = u.name || [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
            usersMap.set(String(u._id), full || null);
          });
        }
      }

      // Формируем «лёгкий» ответ с owner: { _id, name }
      const items = docs.map((doc) => {
        // Нормализуем ownerId
        let ownerId = null;
        const raw = doc.owner_id ?? doc.owner ?? null;
        if (raw) {
          if (typeof raw === 'string') ownerId = raw;
          else if (raw instanceof mongoose.Types.ObjectId) ownerId = String(raw);
          else if (typeof raw === 'object' && raw._id) ownerId = String(raw._id);
        }

        // Если в doc.owner уже лежит объект с именем — используем его
        let ownerObj = null;
        if (raw && typeof raw === 'object' && raw.name) {
          ownerObj = { _id: ownerId || (raw._id ? String(raw._id) : null), name: raw.name };
        } else if (ownerId) {
          ownerObj = { _id: ownerId, name: usersMap.get(ownerId) || null };
        }

        return {
          _id: String(doc._id),
          name: doc.name || doc.title || '',
          title: doc.title || doc.name || '',
          description: doc.description || '',
          image: doc.image || null,
          tags: Array.isArray(doc.tags) ? doc.tags : [],
          owner_id: ownerId || null,
          owner: ownerObj, // <-- фронт читает owner.name
          updatedAt: doc.updatedAt || null,
          createdAt: doc.createdAt || null,
        };
      });

      out.inventories = { total, items };
    }

    // ----- Элементы -----
    if (wantItems) {
      const filterIt = buildTextFilter(q, ['name', 'title', 'description', 'tags']);
      const projectionIt = {
        name: 1,
        title: 1,
        description: 1,
        image: 1,
        tags: 1,
        // inventory может храниться по-разному
        inventoryId: 1,
        inventory_id: 1,
        inventory: 1,
        updatedAt: 1,
      };

      const [docs, total] = await Promise.all([
        db().collection('items')
          .find(filterIt, { projection: projectionIt })
          .sort({ updatedAt: -1, _id: -1 })
          .skip((pg - 1) * lim)
          .limit(lim)
          .toArray(),
        db().collection('items').countDocuments(filterIt),
      ]);

      const items = docs.map((doc) => {
        const invRaw = doc.inventoryId ?? doc.inventory_id ?? doc.inventory ?? null;
        let invId = null;
        let invName = null;

        if (invRaw) {
          if (typeof invRaw === 'string' && mongoose.isValidObjectId(invRaw)) {
            invId = String(invRaw);
          } else if (invRaw && typeof invRaw === 'object') {
            if (invRaw._id) invId = String(invRaw._id);
            invName = invRaw.name || invRaw.title || null;
          } else if (invRaw instanceof mongoose.Types.ObjectId) {
            invId = String(invRaw);
          }
        }

        return {
          _id: String(doc._id),
          inventoryId: invId,
          inventoryName: invName || null,
          name: doc.name || doc.title || '',
          description: doc.description || '',
          image: doc.image || null,
          tags: Array.isArray(doc.tags) ? doc.tags : [],
          updatedAt: doc.updatedAt || null,
        };
      });

      out.items = { total, items };
    }

    res.json(out);
  } catch (err) {
    next(err);
  }
});

export default router;
