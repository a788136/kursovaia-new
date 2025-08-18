// routes/inventories.customId.js
import { Router } from 'express';
import { db, toObjectId, requireAuth, canEdit, validateCustomIdFormat } from './_shared.js';

const router = Router();

/**
 * GET /inventories/:id/customIdFormat
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
