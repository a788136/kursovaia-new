import mongoose from 'mongoose';
const { Schema } = mongoose;

const LikeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// уникальность лайка на (user, item)
LikeSchema.index({ user: 1, item: 1 }, { unique: true });

export default mongoose.model('Like', LikeSchema);
