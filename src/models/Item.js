// src/models/Item.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const ItemSchema = new Schema(
  {
    inventory: {
      type: Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
      index: true,
    },
    custom_id: { type: String, required: true },
    fields: { type: Schema.Types.Mixed, default: {} },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Уникальность custom_id ВНУТРИ инвентаризации
ItemSchema.index({ inventory: 1, custom_id: 1 }, { unique: true });

// Небольшая нормализация: убираем пробелы по краям у custom_id
ItemSchema.pre('validate', function (next) {
  if (typeof this.custom_id === 'string') {
    this.custom_id = this.custom_id.trim();
  }
  next();
});

// Удобный JSON для фронта: id вместо _id
ItemSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});
ItemSchema.set('toObject', { virtuals: true });

// Экспортируем и как default, и как named — чтобы любые импорты работали
const Item = mongoose.model('Item', ItemSchema);
export { Item };
export default Item;
