const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  discordId: { type: String, required: true },
  guildId: { type: String, default: null },
  provider: { type: String, enum: ['lootlabs', 'workink'], required: true },
  durationHours: { type: Number, required: true }, // 24 hoặc 48
  requiredTasks: { type: Number, required: true }, // 1 hoặc 2
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired'],
    default: 'pending',
  },
  gatedUrl: { type: String, default: null },
  clientIp: { type: String, default: null }, // dùng để khớp session khi work.ink callback về (so với byIp)
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

// Tự động xoá document khỏi MongoDB sau khi expiresAt trôi qua -> khỏi cần cron dọn rác.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
