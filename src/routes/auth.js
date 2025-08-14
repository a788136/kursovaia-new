import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { requireAuth, attachUser } from '../middleware/auth.js';
import { signAccessToken } from '../config/jwt.js';
import passport from '../config/passport.js';
import { buildRedirect } from '../lib/buildRedirect.js';

const router = Router();

/* ===== Email/Пароль → JWT ===== */
router.post('/login', attachUser, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = await User.findOne({ email: email.toLowerCase() }).exec();
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.isBlocked) return res.status(403).json({ error: 'User is blocked' });

  const ok = await bcrypt.compare(password, user.passwordHash || '');
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = signAccessToken(user);
  res.json({ accessToken, user: user.toClient() });
});

/* ===== Logout (инвалидация) ===== */
router.post('/logout', requireAuth, async (req, res) => {
  try { req.user.tokenVersion = (req.user.tokenVersion || 0) + 1; await req.user.save(); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Failed to logout' }); }
});

/* ===== /auth/me ===== */
router.get('/me', attachUser, async (req, res) => {
  if (!req.jwt?.sub) return res.json({ authenticated: false });
  const user = await User.findById(req.jwt.sub).exec();
  if (!user) return res.json({ authenticated: false });
  if ((user.tokenVersion || 0) !== (req.jwt.tv || 0)) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: user.toClient() });
});

/* ===== Google ===== */
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    if (err || !user) return res.redirect(buildRedirect('/#/oauth?error=google_auth_error'));
    try {
      const token = signAccessToken(user);
      return res.redirect(buildRedirect(`/#/oauth?token=${encodeURIComponent(token)}`));
    } catch { return res.redirect(buildRedirect('/#/oauth?error=token_sign_error')); }
  })(req, res, next);
});

/* ===== GitHub (НОВОЕ) ===== */
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
router.get('/github/callback', (req, res, next) => {
  passport.authenticate('github', async (err, user, info) => {
    if (err || !user) {
      console.warn('[github] auth error:', err || info);
      return res.redirect(buildRedirect('/#/oauth?error=github_auth_error'));
    }
    try {
      const token = signAccessToken(user);
      return res.redirect(buildRedirect(`/#/oauth?token=${encodeURIComponent(token)}`));
    } catch (e) {
      console.error('[github] token sign error:', e);
      return res.redirect(buildRedirect('/#/oauth?error=token_sign_error'));
    }
  })(req, res, next);
});

export default router;
