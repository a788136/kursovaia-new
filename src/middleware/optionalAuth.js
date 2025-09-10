// src/middleware/optionalAuth.js
// Гибридная "мягкая" авторизация без passport-jwt.
// Поддерживает: сессионного пользователя (Passport после Google OAuth)
// ИЛИ Bearer JWT в заголовке Authorization.
// Если ничего нет — пропускаем запрос без 401.

import { verifyAccessToken } from '../config/jwt.js';
import { User } from '../models/User.js';

export default async function optionalAuth(req, _res, next) {
  try {
    // 1) Уже аутентифицирован через сессию (Passport)
    if ((typeof req.isAuthenticated === 'function' && req.isAuthenticated()) || req.user) {
      req.authenticated = true;
      return next();
    }

    // 2) Bearer JWT
    const hdr = req.headers.authorization || '';
    if (hdr.startsWith('Bearer ')) {
      const token = hdr.slice(7).trim();
      if (token) {
        const payload = verifyAccessToken(token);
        if (payload && payload.sub) {
          const user = await User.findById(payload.sub).exec();
          // если используешь инвалидацию токенов по версии — проверяем
          if (user && ((user.tokenVersion || 0) === (payload.tv || 0))) {
            req.user = user;
            req.authenticated = true;
            return next();
          }
        }
      }
    }

    // 3) Нет ни сессии, ни корректного Bearer — пускаем без пользователя
    req.authenticated = false;
    return next();
  } catch (_e) {
    // optional — никогда не роняем запрос
    req.authenticated = false;
    return next();
  }
}
