// src/models/Counter.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const CounterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // <-- этого достаточно
    seq: { type: Number, required: true, default: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// УДАЛИ ЭТУ СТРОКУ, чтобы не дублировать индекс:
// CounterSchema.index({ key: 1 }, { unique: true });

// Чтобы не пересоздавать модель при хот-перезагрузках:
export default mongoose.models.Counter || mongoose.model('Counter', CounterSchema);
