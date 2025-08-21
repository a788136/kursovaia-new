// routes/access.my.js
import { Router } from 'express';
import { db, toObjectId, toClientLite, requireAuth } from './_shared.js';

const router = Router();

/**
 * GET /access/my?type=write|read
 * Требует JWT. Возвращает { items: [{ inventory, accessType }] }
 * Владельца считаем как write.
 */
router.get('/access/my', requireAuth, async (req, res, next) => {
  try {
    const type = String(req.query.type || 'write').toLowerCase();
    const uid = req.user?._id;
    const uidStr = String(uid);

    const writeOr = [];
    writeOr.push({ owner_id: toObjectId(uidStr) ?? uidStr });
    writeOr.push({ [`access.${uidStr}`]: 'write' });
    writeOr.push({ [`access.${uidStr}`]: true });
    writeOr.push({ [`access.${uidStr}`]: 1 });
    writeOr.push({ [`access.${uidStr}`]: 2 });
    for (const k of ['userId', 'user_id', 'id']) {
      writeOr.push({ access: { $elemMatch: { [k]: toObjectId(uidStr) ?? uidStr, accessType: 'write' } } });
      writeOr.push({ 'access.users': { $elemMatch: { [k]: toObjectId(uidStr) ?? uidStr, accessType: 'write' } } });
    }

    const readOr = [...writeOr, { [`access.${uidStr}`]: 'read' }];
    for (const k of ['userId', 'user_id', 'id']) {
      readOr.push({ access: { $elemMatch: { [k]: toObjectId(uidStr) ?? uidStr, accessType: 'read' } } });
      readOr.push({ 'access.users': { $elemMatch: { [k]: toObjectId(uidStr) ?? uidStr, accessType: 'read' } } });
    }

    const filter = { $or: type === 'read' ? readOr : writeOr };

    const docs = await db()
      .collection('inventories')
      .find(filter, {
        projection: {
          title: 1, name: 1, description: 1, image: 1, tags: 1,
          owner_id: 1, access: 1, updatedAt: 1, createdAt: 1,
        },
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(200)
      .toArray();

    const items = docs.map((inv) => {
      let accessType = 'read';
      if (String(inv.owner_id) === uidStr) {
        accessType = 'write';
      } else if (inv && inv.access) {
        const direct = inv.access[uidStr];
        if (direct === 'write' || direct === true || direct === 1 || direct === 2) accessType = 'write';
        const arrs = [];
        if (Array.isArray(inv.access)) arrs.push(inv.access);
        if (inv.access && Array.isArray(inv.access.users)) arrs.push(inv.access.users);
        for (const arr of arrs) {
          const hit = arr?.find?.((x) => {
            const ids = [x?.userId, x?.user_id, x?.id].map((v) => String(v || ''));
            return ids.includes(uidStr);
          });
          if (hit?.accessType === 'write') { accessType = 'write'; break; }
        }
      }
      return { inventory: toClientLite(inv), accessType };
    });

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

export default router;
