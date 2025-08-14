// src/lib/buildRedirect.js
import { loadEnv } from '../config/env.js';

/**
 * Собирает URL для редиректа на фронт.
 * Работает и если loadEnv() возвращает только CLIENT_ORIGINS,
 * и если там есть CLIENT_URL (строка доменов через запятую).
 */
export function buildRedirect(path = '/') {
  const env = loadEnv();

  // 1) Пробуем взять первый домен из CLIENT_ORIGINS (массив)
  let primary =
    Array.isArray(env.CLIENT_ORIGINS) && env.CLIENT_ORIGINS.length
      ? env.CLIENT_ORIGINS[0]
      : null;

  // 2) Фолбэк: распарсить CLIENT_URL (строка доменов через запятую)
  if (!primary && typeof env.CLIENT_URL === 'string') {
    primary = env.CLIENT_URL.split(',')[0]?.trim() || null;
  }

  if (!primary) {
    throw new Error('CLIENT_URL/CLIENT_ORIGINS is not configured');
  }

  // Абсолютные URL пропускаем как есть
  if (typeof path === 'string' && /^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedBase = primary.replace(/\/+$/, '');
  const normalizedPath = String(path || '/').startsWith('/')
    ? path
    : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}
