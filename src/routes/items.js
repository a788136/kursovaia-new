// src/routes/items.js
import { Router } from 'express';
import {
  listItems,
  createItem,
  updateItem,
  deleteItem,
} from '../controllers/itemController.js';

// При желании можно подключить мидлварь аутентификации:
// import ensureAuth from '../middlewares/ensureAuth.js';

const router = Router();

// GET /inventories/:id/items
router.get('/inventories/:id/items', /* ensureAuth, */ listItems);

// POST /inventories/:id/items
router.post('/inventories/:id/items', /* ensureAuth, */ createItem);

// PUT /items/:itemId
router.put('/items/:itemId', /* ensureAuth, */ updateItem);

// DELETE /items/:itemId
router.delete('/items/:itemId', /* ensureAuth, */ deleteItem);

export default router;
