import passport from '../config/passport.js';

/**
 * Необязательная аутентификация: пробуем прочитать JWT,
 * но при ошибке/отсутствии токена просто идём дальше без 401.
 */
export default function optionalAuth(req, res, next) {
  // нет заголовка — сразу пропускаем
  if (!req.headers?.authorization) return next();

  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (!err && user) req.user = user; // тихо проставим пользователя, если получилось
    return next();
  })(req, res, next);
}
