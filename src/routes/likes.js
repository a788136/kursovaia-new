// src/routes/likes.js
import { Router } from 'express';
import * as likeController from '../controllers/likeController.js';
import ensureAuth, { optionalAuth } from '../middleware/ensureAuth.js';

const router = Router();

// GET /items/:itemId/likes — авторизация опциональна (нужно знать, лайкнул ли текущий юзер)
router.get('/items/:itemId/likes', optionalAuth, likeController.getLikes);

// POST /items/:itemId/like — только для авторизованных
router.post('/items/:itemId/like', ensureAuth, likeController.like);

// DELETE /items/:itemId/like — только для авторизованных
router.delete('/items/:itemId/like', ensureAuth, likeController.unlike);

export default router;
