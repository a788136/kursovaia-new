import session from 'express-session';
import MongoStore from 'connect-mongo';
import { loadEnv } from './env.js';

const { MONGO_URI, SESSION_SECRET, NODE_ENV } = loadEnv();

export const sessionStore = MongoStore.create({
  mongoUrl: MONGO_URI,
  ttl: 60 * 60 * 24 * 7, // 7 days
});

export const sessionConfig = {
  name: 'sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'none',                 // кросс‑домен (Vercel ↔ Render)
    secure: NODE_ENV === 'production',// в проде обязательно HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
};
