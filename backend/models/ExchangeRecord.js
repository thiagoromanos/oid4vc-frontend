const mongoose = require('mongoose');

const ExchangeRecordSchema = new mongoose.Schema({
  exchange_id: { type: String, required: true, unique: true },
  supported_cred_id: { type: String, required: true },
  credential_subject: { type: Object, required: true },
  credential_offer: { type: String },
  offer_data: { type: Object },
  raw_record: { type: Object },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ExchangeRecord', ExchangeRecordSchema);
