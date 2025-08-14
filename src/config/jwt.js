import jwt from 'jsonwebtoken';
import { loadEnv } from './env.js';

const { JWT_SECRET, JWT_EXPIRES } = loadEnv();

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      tv: user.tokenVersion || 0, // для инвалидации при logout
      role: user.isAdmin ? 'admin' : 'user'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
