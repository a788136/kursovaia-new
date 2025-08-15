import mongoose from 'mongoose';
const { Schema } = mongoose;

const DiscussionPostSchema = new Schema(
  {
    inventoryId: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, trim: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

DiscussionPostSchema.index({ inventoryId: 1, createdAt: 1 });

export default mongoose.model('DiscussionPost', DiscussionPostSchema);
