// src/controllers/likeController.js
import mongoose from 'mongoose';
import Like from '../models/Like.js';
import Item from '../models/Item.js';

/**
 * Безопасно получить строковый userId из разных мест:
 * - req.user (устанавливается requireAuth)
 * - req.jwt.sub (устанавливается attachUser)
 */
function getUserId(req) {
  const fromUser = req.user && (req.user._id || req.user.id);
  if (fromUser) return String(fromUser);
  const sub = req.jwt && (req.jwt.sub || req.jwt.userId || req.jwt.id || req.jwt._id);
  return sub ? String(sub) : null;
}

// GET /items/:itemId/likes
export async function getLikes(req, res, next) {
  try {
    const { itemId } = req.params;

    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }

    const exists = await Item.exists({ _id: itemId });
    if (!exists) return res.status(404).json({ error: 'Item not found' });

    const [count, liked] = await Promise.all([
      Like.countDocuments({ item: itemId }),
      (async () => {
        const userId = getUserId(req);
        if (!userId) return false;
        const ex = await Like.exists({ item: itemId, user: userId });
        return Boolean(ex);
      })(),
    ]);

    return res.json({ count, liked });
  } catch (e) {
    return next(e);
  }
}

// POST /items/:itemId/like
export async function like(req, res, next) {
  try {
    const { itemId } = req.params;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }

    const exists = await Item.exists({ _id: itemId });
    if (!exists) return res.status(404).json({ error: 'Item not found' });

    // upsert лайка (без ошибки на повтор)
    await Like.updateOne(
      { item: itemId, user: userId },
      { $setOnInsert: { created_at: new Date() } },
      { upsert: true }
    );

    const count = await Like.countDocuments({ item: itemId });
    return res.json({ ok: true, count, liked: true });
  } catch (e) {
    return next(e);
  }
}

// DELETE /items/:itemId/like
export async function unlike(req, res, next) {
  try {
    const { itemId } = req.params;
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!mongoose.isValidObjectId(itemId)) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }

    const exists = await Item.exists({ _id: itemId });
    if (!exists) return res.status(404).json({ error: 'Item not found' });

    await Like.deleteOne({ item: itemId, user: userId });

    const count = await Like.countDocuments({ item: itemId });
    return res.json({ ok: true, count, liked: false });
  } catch (e) {
    return next(e);
  }
}
