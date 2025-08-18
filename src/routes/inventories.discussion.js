// routes/inventories.discussion.js
import { Router } from 'express';
import { db, toObjectId, requireAuth } from './_shared.js';

const router = Router();

/**
 * GET /inventories/:id/discussion
 */
router.get('/inventories/:id/discussion', async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const lim = Math.max(1, Math.min(+(req.query.limit || 200), 500));
    const after = req.query.after ? new Date(req.query.after) : null;
    if (after && isNaN(after.getTime())) {
      return res.status(400).json({ error: 'Invalid after' });
    }

    const match = after ? { inventoryId: id, createdAt: { $gt: after } } : { inventoryId: id };

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: 1, _id: 1 } },
      { $limit: lim },
      { $lookup: { from: 'users', localField: 'authorId', foreignField: '_id', as: 'author' } },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          text: 1,
          createdAt: 1,
          author: {
            id: '$author._id',
            name: '$author.name',
            avatar: '$author.avatar',
          },
        }
      }
    ];

    const posts = await db().collection('discussionposts').aggregate(pipeline).toArray();
    const items = posts.map(p => ({
      id: String(p._id),
      inventoryId: String(id),
      text: p.text,
      createdAt: p.createdAt,
      author: {
        id: p.author?.id ? String(p.author.id) : '',
        name: p.author?.name || 'User',
        avatar: p.author?.avatar || '',
      },
    }));
    res.json({ items, count: items.length });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /inventories/:id/discussion
 */
router.post('/inventories/:id/discussion', requireAuth, async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Text is required' });
    if (text.length > 5000) return res.status(400).json({ error: 'Text too long' });

    const doc = {
      inventoryId: id,
      authorId: toObjectId(req.user._id) ?? req.user._id,
      text,
      createdAt: new Date(),
    };

    const r = await db().collection('discussionposts').insertOne(doc);

    const payload = {
      id: String(r.insertedId),
      inventoryId: String(id),
      text,
      createdAt: doc.createdAt,
      author: {
        id: String(req.user._id),
        name: req.user.name,
        avatar: req.user.avatar || '',
      },
    };

    const io = req.app.get('io');
    if (io) io.to(`inv:${String(id)}`).emit('discussion:new', payload);

    res.status(201).json(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
