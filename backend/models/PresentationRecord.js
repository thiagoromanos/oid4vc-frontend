const mongoose = require('mongoose');

const PresentationRecordSchema = new mongoose.Schema({
  presentation_id: { type: String, required: true, unique: true },
  request_id: { type: String },
  pres_def_id: { type: String },
  request_uri: { type: String },
  status: { type: String, default: 'request-created' },
  verified: { type: Boolean, default: false },
  verified_claims: { type: Object, default: {} },
  matched_credentials: { type: Object, default: {} },
  errors: { type: Array, default: [] },
  raw_record: { type: Object },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PresentationRecord', PresentationRecordSchema);
