import Like from '../models/Like.js';
import Item from '../models/Item.js'; // default export из твоего Item.js

// GET /items/:itemId/likes
export async function getLikes(req, res, next) {
  try {
    const { itemId } = req.params;

    const item = await Item.findById(itemId).select('_id').lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const [count, liked] = await Promise.all([
      Like.countDocuments({ item: itemId }),
      req.user
        ? Like.exists({ item: itemId, user: req.user._id }).then(Boolean)
        : false,
    ]);

    res.json({ count, liked });
  } catch (e) { next(e); }
}

// POST /items/:itemId/like
export async function like(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const item = await Item.findById(itemId).select('_id').lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // upsert — гарантирует идемпотентность
    await Like.updateOne(
      { item: itemId, user: req.user._id },
      { $setOnInsert: { item: itemId, user: req.user._id, created_at: new Date() } },
      { upsert: true }
    );

    const count = await Like.countDocuments({ item: itemId });
    res.status(200).json({ ok: true, count, liked: true });
  } catch (e) { next(e); }
}

// DELETE /items/:itemId/like
export async function unlike(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    await Like.deleteOne({ item: itemId, user: req.user._id });
    const count = await Like.countDocuments({ item: itemId });
    res.status(200).json({ ok: true, count, liked: false });
  } catch (e) { next(e); }
}
