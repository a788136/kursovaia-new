// routes/inventories.home.js
import { Router } from 'express';
import { db, toClientLite } from './_shared.js';

const router = Router();

/**
 * GET /inventories/latest?limit=10
 * Теперь с автором (owner) через $lookup.
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
              { $ifNull: ['$updatedAt', { $ifNull: ['$created_at', '$createdAt'] }] },
            ],
          },
        },
      },
      { $sort: { sortKey: -1, _id: -1 } },
      { $limit: limit },
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
 * Теперь также возвращаем owner.
 */
router.get('/inventories/top', async (_req, res, next) => {
  try {
    const pipeline = [
      // считаем количество items на инвентарь
      {
        $addFields: {
          invIdRaw: { $ifNull: ['$inventory_id', { $ifNull: ['$inventoryId', '$inventory'] }] },
        },
      },
      {
        $addFields: {
          invId: {
            $cond: [
              { $eq: [{ $type: '$invIdRaw' }, 'string'] },
              { $toObjectId: '$invIdRaw' },
              '$invIdRaw',
            ],
          },
        },
      },
      { $match: { invId: { $exists: true, $ne: null } } },
      { $group: { _id: '$invId', itemsCount: { $sum: 1 } } },
      { $sort: { itemsCount: -1 } },
      { $limit: 5 },

      // подтягиваем сам инвентарь
      {
        $lookup: {
          from: 'inventories',
          localField: '_id',
          foreignField: '_id',
          as: 'inventory',
        },
      },
      { $unwind: '$inventory' },

      // переносим поля инвентаря в корень
      { $replaceRoot: { newRoot: { $mergeObjects: ['$$ROOT', '$inventory'] } } },

      // подтягиваем автора
      {
        $lookup: {
          from: 'users',
          localField: 'owner_id',
          foreignField: '_id',
          as: 'ownerUser',
        },
      },
      { $unwind: { path: '$ownerUser', preserveNullAndEmptyArrays: true } },

      // финальная проекция
      {
        $project: {
          itemsCount: 1,
          _id: 1,
          title: 1,
          name: 1,
          description: 1,
          image: 1,
          cover: 1,
          tags: 1,
          owner_id: 1,
          createdAt: 1,
          updatedAt: 1,
          owner: {
            id: '$ownerUser._id',
            name: '$ownerUser.name',
            email: '$ownerUser.email',
            avatar: '$ownerUser.avatar',
          },
        },
      },
    ];

    const raw = await db().collection('items').aggregate(pipeline).toArray();
    const top = raw.map((doc) => toClientLite({ ...doc, _id: doc._id }));
    res.json(top);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /tags — уникальные теги (без изменений)
 */
router.get('/tags', async (_req, res, next) => {
  try {
    const pipeline = [
      { $project: { tags: 1 } },
      { $unwind: '$tags' },
      { $addFields: { tagNorm: { $toLower: '$tags' } } },
      { $group: { _id: '$tagNorm' } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, tag: '$_id' } },
    ];

    const tags = await db().collection('inventories').aggregate(pipeline).toArray();
    res.json(tags.map((t) => t.tag));
  } catch (err) {
    next(err);
  }
});

export default router;
