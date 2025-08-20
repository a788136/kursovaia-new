// routes/search.js
import mongoose from 'mongoose';
import { Router } from 'express';
import { db, buildTextFilter, toClientLite } from './_shared.js';

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
      // ВАЖНО: добавили owner и owner_id в projection, чтобы фронт мог показать автора
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

      out.inventories = { total, items: docs.map(toClientLite) };
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
        // Унифицируем inventoryId
        const invRaw = doc.inventoryId ?? doc.inventory_id ?? doc.inventory ?? null;
        let invId = null;
        let invName = null;

        if (invRaw) {
          if (typeof invRaw === 'string' && mongoose.isValidObjectId(invRaw)) {
            invId = String(invRaw);
          } else if (invRaw && typeof invRaw === 'object') {
            if (invRaw._id) invId = String(invRaw._id);
            // попробуем достать имя инвентаризации, если оно вшито
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
