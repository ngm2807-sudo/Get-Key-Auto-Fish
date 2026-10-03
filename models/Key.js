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
  expiresAt: { type: Date, default: null, index: true }, // null = vĩnh viễn
  hwid: { type: String, default: null, index: true },
  status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  source: { type: String, enum: ['checkpoint', 'panel'], required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Key', keySchema);
