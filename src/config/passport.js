import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { loadEnv } from './env.js';
import { User } from '../models/User.js';

const {
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL,
  GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL
} = loadEnv();

/* ====== Google (как было) ====== */
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
  console.warn('[passport] Google env not set — Google disabled');
} else {
  passport.use(new GoogleStrategy(
    { clientID: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, callbackURL: GOOGLE_CALLBACK_URL },
    async (_at, _rt, profile, done) => {
      try {
        const email = (profile.emails?.[0]?.value || '').toLowerCase();
        const providerId = profile.id;
        const avatar = profile.photos?.[0]?.value || '';
        let user = null;

        if (email) user = await User.findOne({ email }).exec();
        if (!user) user = await User.findOne({ providers: { $elemMatch: { provider: 'google', providerId } } }).exec();

        if (!user) {
          user = await User.create({
            email: email || `google_${providerId}@placeholder.local`,
            name: profile.displayName || email || 'User',
            provider: 'google',
            providers: [{ provider: 'google', providerId }],
            avatar
          });
        } else {
          const hasLink = (user.providers || []).some(p => p.provider === 'google' && p.providerId === providerId);
          if (!hasLink) user.providers = [...(user.providers || []), { provider: 'google', providerId }];
          if (!user.avatar && avatar) user.avatar = avatar;
          if (!user.provider) user.provider = 'google';
          await user.save();
        }

        return done(null, user);
      } catch (e) { console.error('[google] verify error:', e); return done(e); }
    }
  ));
}

/* ====== GitHub (НОВОЕ) ====== */
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_CALLBACK_URL) {
  console.warn('[passport] GitHub env not set — GitHub disabled');
} else {
  passport.use(new GitHubStrategy(
    {
      clientID: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      callbackURL: GITHUB_CALLBACK_URL,
      scope: ['user:email'] // чтобы получить email, если скрыт
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        // Берём email: либо из массива, либо из noreply
        const primaryEmail = (profile.emails?.find(e => e.verified)?.value
          || profile.emails?.[0]?.value
          || (profile.username ? `${profile.username}@users.noreply.github.com` : '')
        ).toLowerCase();

        const providerId = profile.id;
        const avatar = profile.photos?.[0]?.value || '';
        const displayName = profile.displayName || profile.username || primaryEmail || 'GitHub User';

        let user = null;
        if (primaryEmail) user = await User.findOne({ email: primaryEmail }).exec();
        if (!user) user = await User.findOne({ providers: { $elemMatch: { provider: 'github', providerId } } }).exec();

        if (!user) {
          user = await User.create({
            email: primaryEmail || `github_${providerId}@placeholder.local`,
            name: displayName,
            provider: 'github',
            providers: [{ provider: 'github', providerId }],
            avatar
          });
        } else {
          const linked = (user.providers || []).some(p => p.provider === 'github' && p.providerId === providerId);
          if (!linked) user.providers = [...(user.providers || []), { provider: 'github', providerId }];
          if (!user.avatar && avatar) user.avatar = avatar;
          if (!user.provider) user.provider = 'github';
          await user.save();
        }

        return done(null, user);
      } catch (e) { console.error('[github] verify error:', e); return done(e); }
    }
  ));
}

export default passport;
