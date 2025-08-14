// models/Inventory.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const InventorySchema = new Schema(
  {
    owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    category: { type: String, default: '', trim: true },
    image: { type: String, default: '' },

    tags: {
      type: [String],
      default: [],
      set: (arr) =>
        Array.isArray(arr)
          ? [...new Set(arr.map((t) => String(t).trim().toLowerCase()).filter(Boolean))]
          : [],
      validate: {
        validator: (arr) => arr.length <= 20, // мягкое ограничение
        message: 'Too many tags'
      }
    },

    isPublic: { type: Boolean, default: false },

    // произвольное описание полей элементов инвентаризации
    // (оставляем гибким — валидаторы добавим позже при необходимости)
    fields: { type: Array, default: [] },

    // произвольное описание формата кастомного ID
    customIdFormat: { type: Schema.Types.Mixed, default: null }
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false
  }
);

InventorySchema.index({ createdAt: -1 });

export default mongoose.model('Inventory', InventorySchema);
