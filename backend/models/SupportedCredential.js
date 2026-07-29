const mongoose = require('mongoose');

const SupportedCredentialSchema = new mongoose.Schema({
  supported_cred_id: { type: String, required: true, unique: true },
  identifier: { type: String },
  vct: { type: String, required: true },
  format: { type: String, default: 'vc+sd-jwt' },
  sd_list: [{ type: String }],
  cryptographic_binding_methods_supported: [{ type: String }],
  credential_signing_alg_values_supported: [{ type: String }],
  credential_metadata: { type: Object, default: {} },
  raw_record: { type: Object },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SupportedCredential', SupportedCredentialSchema);
