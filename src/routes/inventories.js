// routes/inventories.js
import { Router } from 'express';

// Подроутеры
import home from './inventories.home.js';
import core from './inventories.core.js';
import fields from './inventories.fields.js';
import customId from './inventories.customId.js';
import discussion from './inventories.discussion.js';
import access from './inventories.access.js';
import userSearch from './users.search.js';
import admin from './admin.js';
import search from './search.js';
import accessMy from './access.my.js'; // важно: подключён

// Единый роутер, чтобы app.js не менять
const router = Router();
router.use(home);
router.use(core);
router.use(fields);
router.use(customId);
router.use(discussion);
router.use(access);
router.use(userSearch);
router.use(admin);
router.use(search);
router.use(accessMy); // <- эндпойнт /access/my

export default router;
