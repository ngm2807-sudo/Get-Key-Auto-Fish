const mongoose = require('mongoose');

const keySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  // null = key chưa gắn với ai (vd key tạo tay qua /panel chưa bán),
  // sẽ được điền khi tạo qua checkpoint hoặc do owner gán.
  discordId: { type: String, default: null, index: true },
  durationType: {
    type: String,
    enum: ['permanent', 'hour', 'day', 'week', 'month'],
    required: true,
  },
  durationValue: { type: Number, default: null }, // null khi permanent
  expiresAt: { type: Date, default: null }, // null = vĩnh viễn — TTL index bên dưới tự bỏ qua null
  hwid: { type: String, default: null, index: true },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  source: { type: String, enum: ['checkpoint', 'panel'], required: true },
  createdAt: { type: Date, default: Date.now },
});

// Tự động xoá key khỏi MongoDB ngay khi expiresAt trôi qua. Key permanent
// (expiresAt: null) KHÔNG bị ảnh hưởng — TTL index của MongoDB chỉ xoá các
// document có field này là 1 Date thật sự, bỏ qua null hoàn toàn.
// LƯU Ý: sau khi xoá thì mất luôn lịch sử (Search Info Key/List key trong
// /panel sẽ không còn thấy key này) — không có cách khôi phục.
keySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Key', keySchema);
