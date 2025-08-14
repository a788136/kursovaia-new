import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/** GET /users/me (JWT required) */
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user.toClient());
});

export default router;
