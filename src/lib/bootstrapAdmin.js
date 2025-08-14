import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { loadEnv } from '../config/env.js';

export async function bootstrapAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = loadEnv();
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('[bootstrap] ADMIN_EMAIL/ADMIN_PASSWORD not provided — skipping');
    return;
  }
  const email = ADMIN_EMAIL.toLowerCase();
  let user = await User.findOne({ email }).exec();
  if (user) {
    console.log('[bootstrap] admin exists:', email);
    return;
  }
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  user = await User.create({
    email,
    name: ADMIN_NAME || 'Admin',
    provider: 'local',
    isAdmin: true,
    isBlocked: false,
    lang: 'ru',
    theme: 'light',
    passwordHash
  });
  console.log('[bootstrap] admin created:', email);
}
