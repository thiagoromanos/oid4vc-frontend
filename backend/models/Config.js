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
  // Auth-server (oid4vc plugin auth_server) configuration
  authServerUrl: { type: String, default: '' },           // internal admin URL  e.g. http://auth-server:9000
  authServerAdminToken: { type: String, default: '' },    // ADMIN_MANAGE_AUTH_TOKEN
  authServerPublicUrl: { type: String, default: '' },     // public URL for wallets / AUTHSERVER_NGROK_URL
  authServerPrivateUrl: { type: String, default: '' },    // private URL used by ACA-Py  e.g. http://auth-server:9001
  tenantSecret: { type: String, default: '' },            // TENANT_SECRET / client_secret
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Config', ConfigSchema);
