// src/routes/likes.js
import { Router } from 'express';
import * as likeController from '../controllers/likeController.js';
import { requireAuth, attachUser } from '../middleware/auth.js';

const router = Router();

/**
 * GET /items/:itemId/likes
 * Публичный (auth по желанию): нужен для подсветки "liked" текущего пользователя.
 * attachUser спокойно прочитает Bearer и положит payload в req.jwt, если токена нет — не 401.
 */
router.get('/items/:itemId/likes', attachUser, likeController.getLikes);

/**
 * POST /items/:itemId/like
 * Требует авторизацию (Bearer JWT). requireAuth кладёт полноценного req.user.
 */
router.post('/items/:itemId/like', requireAuth, likeController.like);

/**
 * DELETE /items/:itemId/like
 * Требует авторизацию (Bearer JWT).
 */
router.delete('/items/:itemId/like', requireAuth, likeController.unlike);

export default router;
