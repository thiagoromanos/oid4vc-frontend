const mongoose = require('mongoose');

const DidRecordSchema = new mongoose.Schema({
  did: { type: String, required: true, unique: true },
  method: { type: String, required: true },
  key_type: { type: String, required: true },
  verkey: { type: String },
  posture: { type: String, default: 'wallet_only' },
  metadata: { type: Object, default: {} },
  raw_record: { type: Object },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DidRecord', DidRecordSchema);
