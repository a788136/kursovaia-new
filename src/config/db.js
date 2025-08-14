import mongoose from 'mongoose';
import { loadEnv } from './env.js';

export async function connectDB() {
  const { MONGO_URI } = loadEnv();
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGO_URI);
  console.log('[db] connected');
}
