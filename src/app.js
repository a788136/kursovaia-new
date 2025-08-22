// src/app.js  (или ваш корневой серверный app.js)
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsMiddleware } from './config/cors.js';
import { connectDB } from './config/db.js';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import passport from './config/passport.js';
import { loadEnv } from './config/env.js';
import inventoriesRoutes from './routes/inventories.js';
import itemsRoutes from './routes/items.js';
import likesRoutes from './routes/likes.js';

// Локальный логин email/password
import authLocalRoutes from './routes/auth-local.js';

// ⬇️ наш роутер доступа текущего пользователя
import accessMyRouter from './routes/access.my.js';

const app = express();
const { NODE_ENV } = loadEnv();

app.set('trust proxy', 1);
app.use(helmet());
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(corsMiddleware);
app.options('*', corsMiddleware);

app.use(express.json({ limit: '1mb' }));
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid JSON' });
  return next(err);
});

connectDB().catch(console.error);
app.use(passport.initialize());

// тех. эндпойнты
app.head('/', (_req, res) => res.sendStatus(200));
app.get('/', (_req, res) => res.json({ ok: true, name: 'auth-backend', version: '2.0.0' }));
app.get('/favicon.ico', (_req, res) => res.sendStatus(204));
app.get('/health', (_req, res) => res.json({ ok: true }));

/** ОСНОВНЫЕ РОУТЫ */
app.use('/auth', authLocalRoutes);
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);

// Без префикса — как ждёт фронт
app.use('/', inventoriesRoutes);
app.use('/', itemsRoutes);
app.use('/', likesRoutes);

// ⬇️ ДАБАВЛЕНО: /access/my и на корне, и под /api
app.use('/', accessMyRouter);

/** КОМПАТИБИЛИТИ ПОД /api/* */
app.get('/api', (_req, res) => res.json({ ok: true, name: 'auth-backend', version: '2.0.0' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authLocalRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api', itemsRoutes);
app.use('/api', likesRoutes);
app.use('/api', accessMyRouter);

// универсальный обработчик ошибок
app.use((err, _req, res, _next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: origin not allowed' });
  }
  console.error('[error]', err);
  res.status(err.status || 500).json({
    error: NODE_ENV === 'production' ? 'Internal error' : err.message
  });
});

export default app;
