// src/middlewares/ensureAuth.js
import passport from '../config/passport.js';

/**
 * Жёсткая авторизация: без валидного JWT -> 401
 * Используй на защищённых методах (POST/PUT/DELETE лайков и т.п.)
 */
export default function ensureAuth(req, res, next) {
  return passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    return next();
  })(req, res, next);
}

/**
 * Опциональная авторизация: если есть валидный JWT — положим user в req,
 * если нет — просто пойдём дальше без 401. Удобно для GET-эндпоинтов.
 */
export function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return passport.authenticate('jwt', { session: false }, (err, user) => {
    if (!err && user) req.user = user;
    return next();
  })(req, res, next);
}
