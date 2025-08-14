import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  provider: { type: String, default: 'local' }, // 'local' | 'google'
  providers: [{ provider: String, providerId: String }],
  avatar: { type: String, default: '' },
  isAdmin: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  lang: { type: String, default: 'ru' },
  theme: { type: String, default: 'light' },
  passwordHash: { type: String, default: '' },
  tokenVersion: { type: Number, default: 0 } // для инвалидации JWT при logout
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

UserSchema.methods.toClient = function() {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name,
    provider: this.provider,
    avatar: this.avatar,
    isAdmin: this.isAdmin,
    isBlocked: this.isBlocked,
    lang: this.lang,
    theme: this.theme,
    createdAt: this.createdAt
  };
};

export const User = mongoose.model('User', UserSchema);
