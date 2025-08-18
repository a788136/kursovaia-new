// routes/inventories.fields.js
import { Router } from 'express';
import { db, toObjectId, requireAuth, canEdit, validateFieldsArray } from './_shared.js';

const router = Router();

/**
 * GET /inventories/:id/fields
 */
router.get('/inventories/:id/fields', async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne(
      { _id: id },
      { projection: { fields: 1 } }
    );
    if (!inv) return res.status(404).json({ error: 'Not found' });

    res.json({ fields: Array.isArray(inv.fields) ? inv.fields : [] });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /inventories/:id/fields
 */
router.put('/inventories/:id/fields', requireAuth, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const inv = await db().collection('inventories').findOne({ _id: id });
    if (!inv) return res.status(404).json({ error: 'Not found' });
    if (!canEdit(req.user, inv)) return res.status(403).json({ error: 'Forbidden' });

    const fields = req.body?.fields;
    const err = validateFieldsArray(fields);
    if (err) return res.status(400).json({ error: err });

    await db().collection('inventories').updateOne(
      { _id: id },
      { $set: { fields, updatedAt: new Date() } }
    );

    const updated = await db().collection('inventories').findOne(
      { _id: id },
      { projection: { fields: 1 } }
    );
    res.json({ fields: Array.isArray(updated.fields) ? updated.fields : [] });
  } catch (err) {
    next(err);
  }
});

export default router;
