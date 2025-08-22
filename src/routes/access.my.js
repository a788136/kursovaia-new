// routes/access.my.js
import { Router } from 'express';
import mongoose from 'mongoose';
import { db, toObjectId, toClientLite, requireAuth } from './_shared.js';

const router = Router();

/**
 * GET /access/my?type=write|read&excludeOwner=true|false
 * Требует JWT.
 * Возвращает { items: [{ inventory: <lite>, accessType }] }.
 * Источник — коллекция inventoryaccesses (userId, inventoryId, accessType).
 */
router.get('/access/my', requireAuth, async (req, res, next) => {
  try {
    const rawUid = req.user?._id;
    const uid = toObjectId(rawUid) ?? rawUid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const type = String(req.query.type || 'write').toLowerCase();
    const excludeOwner = String(req.query.excludeOwner || 'false').toLowerCase() === 'true';

    const matchAccess = { userId: uid };
    if (type === 'write') {
      matchAccess.accessType = 'write';
    } else if (type === 'read') {
      // и write, и read
      matchAccess.accessType = { $in: ['read', 'write'] };
    } else {
      // по умолчанию — write
      matchAccess.accessType = 'write';
    }

    const pipeline = [
      { $match: matchAccess },
      {
        $lookup: {
          from: 'inventories',
          localField: 'inventoryId',
          foreignField: '_id',
          as: 'inv',
        },
      },
      { $unwind: '$inv' },
    ];

    if (excludeOwner) {
      pipeline.push({
        $match: {
          $expr: { $ne: ['$inv.owner_id', uid] },
        },
      });
    }

    pipeline.push({ $sort: { 'inv.updatedAt': -1, 'inv._id': -1 } });
    pipeline.push({ $limit: 500 });

    const rows = await db().collection('inventoryaccesses').aggregate(pipeline).toArray();

    const items = rows.map((r) => ({
      inventory: toClientLite(r.inv),
      accessType: r.accessType,
    }));

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

export default router;
