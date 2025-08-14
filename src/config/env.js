import dotenv from 'dotenv';
dotenv.config();

export function loadEnv() {
  const {
    NODE_ENV = 'development',
    PORT = '10000',
    MONGO_URI,
    CLIENT_URL = '',
    CLIENT_ORIGINS = '', // можно задавать отдельно
    JWT_SECRET,
    JWT_EXPIRES = '15m',

    // Google
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,

    // GitHub
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL,
  } = process.env;

  if (!MONGO_URI) throw new Error('MONGO_URI is required');
  if (!JWT_SECRET) throw new Error('JWT_SECRET is required');

  // Берём список доменов из CLIENT_ORIGINS или CLIENT_URL
  const rawOrigins = (CLIENT_ORIGINS || CLIENT_URL)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Нормализуем каждое значение до protocol//host (без путей)
  const ORIGINS = rawOrigins.map(s => {
    try {
      const u = new URL(s);
      return `${u.protocol}//${u.host}`;
    } catch {
      // если это шаблон с *, оставляем как есть
      return s;
    }
  });

  return {
    NODE_ENV,
    PORT: Number(PORT),
    MONGO_URI,
    CLIENT_ORIGINS: ORIGINS,
    JWT_SECRET,
    JWT_EXPIRES,

    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL,

    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL,
  };
}
