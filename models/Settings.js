const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  logChannelId: { type: String, default: null },
});

module.exports = mongoose.model('Settings', settingsSchema);
