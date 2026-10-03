const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
  hwid: { type: String, required: true, unique: true, index: true },
  reason: { type: String, default: null },
  blockedBy: { type: String, required: true }, // Discord ID của owner đã chặn
  blockedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Blacklist', blacklistSchema);
