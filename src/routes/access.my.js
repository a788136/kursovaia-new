// routes/access.my.js
import { Router } from 'express';
import { db, toObjectId, toClientLite, requireAuth } from './_shared.js';

const router = Router();

/**
 * GET /access/my?type=write|read[&excludeOwner=true]
 * Требует JWT. Возвращает { items: [{ inventory, accessType }] }
 * Раньше владельца считали как write; теперь можно опционально исключить владельца.
 */
router.get('/access/my', requireAuth, async (req, res, next) => {
  try {
    const type = String(req.query.type || 'write').toLowerCase();
    const excludeOwner = String(req.query.excludeOwner || 'false') === 'true';
    const uid = req.user?._id;
    const uidStr = String(uid);
    const uidObj = toObjectId(uidStr) ?? uidStr;

    // Подбираем фильтр по типу доступа
    const writeOr = (() => {
      const or = [];
      // Владелец — write (но можем исключить на этапе $and)
      or.push({ owner_id: uidObj });
      // map
      or.push({ [`access.${uidStr}`]: 'write' });
      or.push({ [`access.${uidStr}`]: true });
      or.push({ [`access.${uidStr}`]: 1 });
      or.push({ [`access.${uidStr}`]: 2 });
      // arrays
      for (const k of ['userId', 'user_id', 'id']) {
        or.push({ access: { $elemMatch: { [k]: uidObj, accessType: 'write' } } });
        or.push({ 'access.users': { $elemMatch: { [k]: uidObj, accessType: 'write' } } });
      }
      return or;
    })();

    const readOr = (() => {
      const or = [...writeOr];
      or.push({ [`access.${uidStr}`]: 'read' });
      for (const k of ['userId', 'user_id', 'id']) {
        or.push({ access: { $elemMatch: { [k]: uidObj, accessType: 'read' } } });
        or.push({ 'access.users': { $elemMatch: { [k]: uidObj, accessType: 'read' } } });
      }
      return or;
    })();

    const base = { $or: type === 'read' ? readOr : writeOr };
    const filter = excludeOwner
      ? { $and: [ base, { owner_id: { $ne: uidObj } } ] }
      : base;

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
      // вычислим accessType для ответа (оставлено как было)
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
