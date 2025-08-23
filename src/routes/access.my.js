// routes/access.my.js
import { Router } from 'express';
import { db, toObjectId, toClientLite, requireAuth } from './_shared.js';

const router = Router();

/**
 * Обработчик списка доступов пользователя
 * GET /access/my?type=write|read&excludeOwner=true|false
 * и алиас: GET /inventory-access/my
 * Требует JWT.
 * Ответ: { items: [{ inventory: <lite>, accessType }] }
 */
async function handleAccessMy(req, res, next) {
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
      // включаем и read, и write
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
      // Исключить собственные инвентари, если нужно
      ...(excludeOwner ? [{ $match: { $expr: { $ne: ['$inv.owner_id', uid] } } }] : []),

      // <<< НОВОЕ >>> подтягиваем владельца и вкладываем в inv.owner
      {
        $lookup: {
          from: 'users',
          localField: 'inv.owner_id',
          foreignField: '_id',
          as: 'ownerUser',
        },
      },
      { $unwind: { path: '$ownerUser', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          'inv.owner': {
            id: { $toString: '$ownerUser._id' },
            name: { $ifNull: ['$ownerUser.name', ''] },
            email: { $ifNull: ['$ownerUser.email', ''] },
            avatar: { $ifNull: ['$ownerUser.avatar', ''] },
          },
        },
      },

      { $sort: { 'inv.updatedAt': -1, 'inv._id': -1 } },
      { $limit: 500 },
    ];

    const rows = await db().collection('inventoryaccesses').aggregate(pipeline).toArray();

    const items = rows.map((r) => ({
      inventory: toClientLite(r.inv),
      accessType: r.accessType,
    }));

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

// Основной маршрут
router.get('/access/my', requireAuth, handleAccessMy);

// Алиас для обратной совместимости с фронтом (fallback B)
router.get('/inventory-access/my', requireAuth, handleAccessMy);

export default router;
