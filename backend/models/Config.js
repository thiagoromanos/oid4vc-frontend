const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global_config', unique: true },
  acapyUrl: { type: String, default: 'http://localhost:8021' },
  bearerToken: { type: String, default: '' },
  adminApiKey: { type: String, default: '' },
  activeTenant: {
    wallet_id: String,
    wallet_name: String,
    label: String,
    token: String,
    created_at: Date
  },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Config', ConfigSchema);
