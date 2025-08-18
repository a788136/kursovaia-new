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
    const lim = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const pg = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const wantInv = type === 'all' || type === 'inventories';
    const wantItems = type === 'all' || type === 'items';

    const out = { q, type, page: pg, limit: lim };

    if (wantInv) {
      const filterInv = buildTextFilter(q, ['title', 'description', 'name', 'tags']);
      const [docs, total] = await Promise.all([
        db().collection('inventories')
          .find(filterInv, { projection: { title: 1, description: 1, image: 1, tags: 1, updatedAt: 1 } })
          .sort({ updatedAt: -1, _id: -1 })
          .skip((pg - 1) * lim)
          .limit(lim)
          .toArray(),
        db().collection('inventories').countDocuments(filterInv),
      ]);
      out.inventories = { total, items: docs.map(toClientLite) };
    }

    if (wantItems) {
      const filterIt = buildTextFilter(q, ['name', 'title', 'description', 'tags']);
      const [docs, total] = await Promise.all([
        db().collection('items')
          .find(filterIt, { projection: { name: 1, title: 1, description: 1, image: 1, tags: 1, inventoryId: 1, inventory_id: 1, inventory: 1, updatedAt: 1 } })
          .sort({ updatedAt: -1, _id: -1 })
          .skip((pg - 1) * lim)
          .limit(lim)
          .toArray(),
        db().collection('items').countDocuments(filterIt),
      ]);

      const items = docs.map((doc) => {
        const invRaw = doc.inventoryId ?? doc.inventory_id ?? doc.inventory ?? null;
        let invId = null;
        if (invRaw) {
          if (typeof invRaw === 'string' && mongoose.isValidObjectId(invRaw)) invId = String(invRaw);
          else if (invRaw && typeof invRaw === 'object' && invRaw._id) invId = String(invRaw._id);
          else if (invRaw instanceof mongoose.Types.ObjectId) invId = String(invRaw);
        }
        return {
          _id: String(doc._id),
          inventoryId: invId,
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
