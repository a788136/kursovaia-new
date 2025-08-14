// src/config/cors.js
import cors from 'cors';
import { loadEnv } from './env.js';

const { CLIENT_ORIGINS } = loadEnv();

/**
 * Проверка origin с поддержкой шаблонов:
 *  - точные домены: https://site.com
 *  - поддомены: https://*.site.com
 *  - локалхосты: http://localhost:5173
 */
function isAllowed(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const candidate = `${u.protocol}//${u.host}`;
    return CLIENT_ORIGINS.some((p) => {
      // превращаем шаблон в регэксп
      const regex = new RegExp(
        '^' +
          p
            .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&') // экранируем спецсимволы
            .replace(/\\\*/g, '.*') + // превращаем * в .*
          '$',
        'i'
      );
      return regex.test(candidate);
    });
  } catch {
    return false;
  }
}

export const corsMiddleware = cors({
  origin(origin, cb) {
    // Разрешаем запросы без Origin (healthchecks, curl и т.п.)
    if (!origin) return cb(null, true);
    if (isAllowed(origin)) return cb(null, true);
    console.warn('[CORS] Blocked:', origin);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false, // JWT в Authorization, cookies не используем
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
});
