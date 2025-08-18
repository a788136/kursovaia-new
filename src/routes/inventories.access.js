// routes/inventories.access.js
import mongoose from 'mongoose';
import { Router } from 'express';
import { db, toObjectId, requireAuth, canEdit } from './_shared.js';

const router = Router();

async function loadAccess(invId) {
  const inv = await db().collection('inventories').findOne({ _id: invId });
  if (!inv) return { notFound: true };

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

  return { inv, owner, items };
}

/**
 * GET /inventories/:id/access
 */
router.get('/inventories/:id/access', requireAuth, async (req, res, next) => {
  try {
    const invId = toObjectId(req.params.id);
    if (!invId) return res.status(400).json({ error: 'Invalid id' });

    const { inv, notFound, owner, items } = await loadAccess(invId);
    if (notFound) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(req.user, inv)) return res.status(403).json({ error: 'Forbidden' });

    res.json({ owner, items });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /inventories/:id/access
 */
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
    } catch {}

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

    const { owner, items } = await loadAccess(invId);
    res.json({ owner, items });
  } catch (err) {
    next(err);
  }
});

export default router;
