const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const Config = require('./models/Config');
const SupportedCredential = require('./models/SupportedCredential');
const ExchangeRecord = require('./models/ExchangeRecord');
const DidRecord = require('./models/DidRecord');
const PresentationDef = require('./models/PresentationDef');
const PresentationRecord = require('./models/PresentationRecord');

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oid4vci';
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log(`Connected to MongoDB at ${MONGODB_URI}`))
  .catch(err => console.error('MongoDB connection error:', err));

// Helper to get active configuration
async function getActiveConfig() {
  let config = await Config.findOne({ key: 'global_config' });
  if (!config) {
    config = await Config.create({
      key: 'global_config',
      acapyUrl: process.env.ACAPY_URL || 'http://localhost:8021',
      bearerToken: process.env.BEARER_TOKEN || ''
    });
  }
  return config;
}

// Helper to create Axios client for ACA-Py
async function getAcapyClient(customConfig = null) {
  const config = customConfig || await getActiveConfig();
  const headers = {};
  if (config.bearerToken) {
    headers['Authorization'] = `Bearer ${config.bearerToken.replace(/^Bearer\s+/i, '')}`;
  }
  if (config.adminApiKey) {
    headers['X-API-Key'] = config.adminApiKey;
  }
  
  return {
    client: axios.create({
      baseURL: config.acapyUrl.replace(/\/+$/, ''),
      headers,
      timeout: 15000
    }),
    config
  };
}

function formatError(err) {
  let msg = err.response?.data || err.message;
  if (typeof msg === 'object') {
    msg = msg.message || msg.error || JSON.stringify(msg);
  }
  if (err.code === 'ECONNREFUSED' || (typeof msg === 'string' && msg.includes('ECONNREFUSED'))) {
    return `${msg}. TIP: If the app is running in Docker and ACA-Py is running on your host machine, 'localhost' refers to the container. Use 'http://host.docker.internal:3001' (or host IP) instead of 'http://localhost:3001'.`;
  }
  return msg;
}

// --- CONFIG ENDPOINTS ---

app.get('/api/config', async (req, res) => {
  try {
    const config = await getActiveConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const { acapyUrl, bearerToken, adminApiKey } = req.body;
    let config = await getActiveConfig();
    if (acapyUrl !== undefined) config.acapyUrl = acapyUrl;
    if (bearerToken !== undefined) config.bearerToken = bearerToken;
    if (adminApiKey !== undefined) config.adminApiKey = adminApiKey;
    config.updatedAt = new Date();
    await config.save();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- MULTITENANCY ENDPOINTS ---

app.post('/api/multitenancy/create-tenant', async (req, res) => {
  try {
    const { wallet_name, wallet_key, label, wallet_type, acapyUrl, adminApiKey } = req.body;
    
    let config = await getActiveConfig();
    const targetUrl = acapyUrl || config.acapyUrl;
    const targetAdminKey = adminApiKey !== undefined ? adminApiKey : config.adminApiKey;

    const headers = {};
    if (targetAdminKey) {
      headers['X-API-Key'] = targetAdminKey;
    }
    headers['accept'] = 'application/json';

    const acapy = axios.create({
      baseURL: targetUrl.replace(/\/+$/, ''),
      headers,
      timeout: 15000
    });

    // 1. Create Wallet / Tenant: POST /multitenancy/wallet
    const walletReqBody = {
      wallet_name: wallet_name || `tenant_${Date.now()}`,
      wallet_key: wallet_key || `key_${Date.now()}`,
      label: label || wallet_name || 'OID4VCI Tenant',
      wallet_type: wallet_type || 'askar',
      key_management_mode: 'managed'
    };

    const createWalletRes = await acapy.post('/multitenancy/wallet', walletReqBody);
    const walletData = createWalletRes.data;
    const walletId = walletData.wallet_id;

    // 2. Get Token for Wallet: POST /multitenancy/wallet/{wallet_id}/token
    const tokenReqBody = wallet_key ? { wallet_key } : {};
    const tokenRes = await acapy.post(`/multitenancy/wallet/${walletId}/token`, tokenReqBody);
    const tokenData = tokenRes.data;
    const token = tokenData.token;

    // Save token & active tenant in config
    config.acapyUrl = targetUrl;
    if (targetAdminKey) config.adminApiKey = targetAdminKey;
    config.bearerToken = token;
    config.activeTenant = {
      wallet_id: walletId,
      wallet_name: walletData.wallet_name || walletReqBody.wallet_name,
      label: walletData.settings?.['wallet.label'] || walletReqBody.label,
      token: token,
      created_at: new Date()
    };
    config.updatedAt = new Date();
    await config.save();

    res.json({
      success: true,
      wallet_id: walletId,
      wallet_name: walletReqBody.wallet_name,
      token: token,
      config: config
    });
  } catch (err) {
    console.error('Create tenant error:', err.response?.data || err.message);
    let errMsg = err.response?.data || err.message;
    if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
      errMsg = `${err.message}. TIP: If running inside Docker, 'localhost' refers to the container. Use 'http://host.docker.internal:3001' to reach ACA-Py on your host machine.`;
    }
    res.status(err.response?.status || 500).json({
      error: errMsg
    });
  }
});

// --- DID MANAGEMENT ENDPOINTS ---

// Create DID: POST /wallet/did/create
app.post('/api/did/create', async (req, res) => {
  try {
    const { client } = await getAcapyClient();
    const { method, key_type, seed } = req.body;

    const payload = {
      method: method || 'key',
      options: {
        key_type: key_type || 'ed25519'
      }
    };
    if (seed && seed.trim()) {
      payload.seed = seed.trim();
    }

    console.log('Sending /wallet/did/create to ACA-Py:', JSON.stringify(payload, null, 2));

    const response = await client.post('/wallet/did/create', payload);
    const didInfo = response.data.result || response.data;

    if (!didInfo || !didInfo.did) {
      return res.status(500).json({ error: 'Failed to extract DID from ACA-Py response', raw: response.data });
    }

    // Save/Upsert DID in MongoDB
    const savedRecord = await DidRecord.findOneAndUpdate(
      { did: didInfo.did },
      {
        did: didInfo.did,
        method: didInfo.method || method || 'key',
        key_type: didInfo.key_type || key_type || 'ed25519',
        verkey: didInfo.verkey || '',
        posture: didInfo.posture || 'wallet_only',
        metadata: didInfo.metadata || {},
        raw_record: didInfo
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      didRecord: savedRecord,
      acapyResponse: response.data
    });
  } catch (err) {
    console.error('Create DID error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: formatError(err)
    });
  }
});

// Get all stored DIDs (with optional sync from ACA-Py GET /wallet/did)
app.get('/api/did/records', async (req, res) => {
  try {
    const { client } = await getAcapyClient();
    try {
      const liveRes = await client.get('/wallet/did');
      const liveDids = liveRes.data.results || [];
      for (const d of liveDids) {
        if (d && d.did) {
          await DidRecord.findOneAndUpdate(
            { did: d.did },
            {
              did: d.did,
              method: d.method || 'key',
              key_type: d.key_type || 'ed25519',
              verkey: d.verkey || '',
              posture: d.posture || 'wallet_only',
              metadata: d.metadata || {},
              raw_record: d
            },
            { upsert: true }
          );
        }
      }
    } catch (acapyErr) {
      console.warn('Live ACA-Py fetch for DIDs failed, falling back to local DB cache:', acapyErr.message);
    }

    const records = await DidRecord.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set DID Public: POST /wallet/did/public
app.post('/api/did/set-public', async (req, res) => {
  try {
    const { did } = req.body;
    if (!did) return res.status(400).json({ error: 'DID is required' });

    const { client } = await getAcapyClient();
    const response = await client.post('/wallet/did/public', null, {
      params: { did }
    });

    const updated = await DidRecord.findOneAndUpdate(
      { did },
      { posture: 'public', raw_record: response.data },
      { new: true }
    );

    res.json({
      success: true,
      didRecord: updated,
      acapyResponse: response.data
    });
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: formatError(err)
    });
  }
});

// --- CREDENTIAL SUPPORTED ENDPOINTS ---

// Create Supported SD-JWT: POST /oid4vci/credential-supported/create/sd-jwt
app.post('/api/credential-supported/create-sd-jwt', async (req, res) => {
  try {
    const { client } = await getAcapyClient();
    const payload = req.body;

    console.log('Sending create/sd-jwt request to ACA-Py:', JSON.stringify(payload, null, 2));

    const response = await client.post('/oid4vci/credential-supported/create/sd-jwt', payload);
    const acapyRecord = response.data;

    // Supported cred ID returned by ACA-Py
    const supported_cred_id = acapyRecord.supported_cred_id || acapyRecord.identifier || payload.id;

    // Store in MongoDB
    const savedRecord = await SupportedCredential.findOneAndUpdate(
      { supported_cred_id },
      {
        supported_cred_id,
        identifier: acapyRecord.identifier || payload.id,
        vct: acapyRecord.vct || payload.vct,
        format: acapyRecord.format || payload.format || 'vc+sd-jwt',
        sd_list: payload.sd_list || [],
        cryptographic_binding_methods_supported: payload.cryptographic_binding_methods_supported || ['did'],
        credential_signing_alg_values_supported: payload.credential_signing_alg_values_supported || ['ES256K'],
        credential_metadata: payload.credential_metadata || acapyRecord.credential_metadata || {},
        raw_record: acapyRecord,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      supported_cred_id,
      record: savedRecord,
      acapyResponse: acapyRecord
    });
  } catch (err) {
    console.error('Create SD-JWT supported cred error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: formatError(err)
    });
  }
});

// Get list of supported credentials stored in DB
app.get('/api/credential-supported/records', async (req, res) => {
  try {
    const records = await SupportedCredential.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single supported credential record by ID (tries ACA-Py GET /oid4vci/credential-supported/records/{supported_cred_id} first)
app.get('/api/credential-supported/records/:supported_cred_id', async (req, res) => {
  const { supported_cred_id } = req.params;
  try {
    const { client } = await getAcapyClient();
    let acapyRecord = null;
    try {
      const response = await client.get(`/oid4vci/credential-supported/records/${supported_cred_id}`);
      acapyRecord = response.data;
    } catch (acapyErr) {
      console.warn(`Live ACA-Py fetch for record ${supported_cred_id} failed, falling back to MongoDB cache:`, acapyErr.message);
    }

    let localRecord = await SupportedCredential.findOne({ supported_cred_id });
    if (acapyRecord) {
      // Update local cache if available
      const identifier = acapyRecord.identifier || (localRecord && localRecord.identifier) || supported_cred_id;
      const vct = acapyRecord.vct || (localRecord && localRecord.vct) || '';
      const format = acapyRecord.format || (localRecord && localRecord.format) || 'vc+sd-jwt';
      const metadata = acapyRecord.credential_metadata || (localRecord && localRecord.credential_metadata) || {};

      localRecord = await SupportedCredential.findOneAndUpdate(
        { supported_cred_id },
        {
          supported_cred_id,
          identifier,
          vct,
          format,
          credential_metadata: metadata,
          raw_record: acapyRecord,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }

    if (!localRecord && !acapyRecord) {
      return res.status(404).json({ error: 'Supported credential record not found' });
    }

    res.json(localRecord || acapyRecord);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EXCHANGE ENDPOINTS ---

// Create Exchange: POST /oid4vci/exchange/create
app.post('/api/exchange/create', async (req, res) => {
  try {
    const { client } = await getAcapyClient();
    const { supported_cred_id, credential_subject, pin, did, verification_method } = req.body;

    if (!supported_cred_id || !credential_subject) {
      return res.status(400).json({ error: 'supported_cred_id and credential_subject are required' });
    }

    const payload = {
      supported_cred_id,
      credential_subject
    };
    if (pin) payload.pin = pin;
    if (did) payload.did = did;
    if (verification_method) payload.verification_method = verification_method;

    console.log('Sending exchange/create to ACA-Py:', JSON.stringify(payload, null, 2));

    const exchangeRes = await client.post('/oid4vci/exchange/create', payload);
    const exchangeRecord = exchangeRes.data;
    const exchangeId = exchangeRecord.exchange_id;

    // Fetch Credential Offer for this exchange: GET /oid4vci/credential-offer?exchange_id={exchange_id}
    let credentialOffer = null;
    let offerData = null;
    try {
      const offerRes = await client.get('/oid4vci/credential-offer', {
        params: { exchange_id: exchangeId }
      });
      offerData = offerRes.data;
      credentialOffer = offerData.credential_offer || (typeof offerData === 'string' ? offerData : null);
    } catch (offerErr) {
      console.warn(`Credential offer fetch failed for exchange ${exchangeId}:`, offerErr.message);
    }

    // Store Exchange Record in MongoDB
    const savedExchange = await ExchangeRecord.create({
      exchange_id: exchangeId,
      supported_cred_id,
      credential_subject,
      credential_offer: credentialOffer,
      offer_data: offerData,
      raw_record: exchangeRecord
    });

    res.json({
      success: true,
      exchange_id: exchangeId,
      credential_offer: credentialOffer,
      exchangeRecord: savedExchange,
      offerData: offerData
    });
  } catch (err) {
    console.error('Create exchange error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: formatError(err)
    });
  }
});

// Get Credential Offer by Exchange ID: GET /oid4vci/credential-offer
app.get('/api/credential-offer', async (req, res) => {
  try {
    const { exchange_id } = req.query;
    const { client } = await getAcapyClient();
    const offerRes = await client.get('/oid4vci/credential-offer', {
      params: { exchange_id }
    });
    res.json(offerRes.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message
    });
  }
});

// Get all exchanges stored in MongoDB
app.get('/api/exchange/records', async (req, res) => {
  try {
    const records = await ExchangeRecord.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- OID4VP PROOF PRESENTATION ENDPOINTS ---

// Create Presentation Definition: POST /oid4vp/presentation-definition
app.post('/api/presentation-definition/create', async (req, res) => {
  try {
    const { client } = await getAcapyClient();
    const { pres_def, name, purpose } = req.body;

    if (!pres_def) {
      return res.status(400).json({ error: 'pres_def object is required' });
    }

    console.log('Sending /oid4vp/presentation-definition to ACA-Py:', JSON.stringify({ pres_def }, null, 2));

    const response = await client.post('/oid4vp/presentation-definition', { pres_def });
    const resData = response.data; // { pres_def_id, pres_def }

    const pres_def_id = resData.pres_def_id || pres_def.id;

    // Save in MongoDB
    const savedRecord = await PresentationDef.findOneAndUpdate(
      { pres_def_id },
      {
        pres_def_id,
        name: name || pres_def.name || pres_def_id,
        purpose: purpose || pres_def.purpose || '',
        pres_def: resData.pres_def || pres_def,
        raw_record: resData
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      pres_def_id,
      record: savedRecord,
      acapyResponse: resData
    });
  } catch (err) {
    console.error('Create presentation definition error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: formatError(err)
    });
  }
});

// Get Presentation Definitions: GET /api/presentation-definition/records
app.get('/api/presentation-definition/records', async (req, res) => {
  try {
    const { client } = await getAcapyClient();
    try {
      const liveRes = await client.get('/oid4vp/presentation-definitions');
      const liveItems = liveRes.data.results || [];
      for (const item of liveItems) {
        if (item && item.pres_def_id) {
          await PresentationDef.findOneAndUpdate(
            { pres_def_id: item.pres_def_id },
            {
              pres_def_id: item.pres_def_id,
              name: item.pres_def?.name || item.pres_def_id,
              purpose: item.pres_def?.purpose || '',
              pres_def: item.pres_def || {},
              raw_record: item
            },
            { upsert: true }
          );
        }
      }
    } catch (acapyErr) {
      console.warn('Live ACA-Py fetch for presentation definitions failed, using DB cache:', acapyErr.message);
    }

    const records = await PresentationDef.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Presentation Request (OID4VP): POST /oid4vp/request
app.post('/api/presentation-request/create', async (req, res) => {
  try {
    const { client } = await getAcapyClient();
    let { pres_def_id, pres_def, dcql_query_id, vp_formats } = req.body;

    // Default vp_formats if omitted
    if (!vp_formats) {
      vp_formats = {
        "vc+sd-jwt": {
          "sd-jwt_alg_values": ["ES256K", "EdDSA", "ES256"]
        }
      };
    }

    // If inline pres_def object provided and no pres_def_id, create definition first
    if (!pres_def_id && pres_def && !dcql_query_id) {
      const presDefRes = await client.post('/oid4vp/presentation-definition', { pres_def });
      pres_def_id = presDefRes.data.pres_def_id || pres_def.id;

      await PresentationDef.findOneAndUpdate(
        { pres_def_id },
        {
          pres_def_id,
          name: pres_def.name || pres_def_id,
          purpose: pres_def.purpose || '',
          pres_def: presDefRes.data.pres_def || pres_def,
          raw_record: presDefRes.data
        },
        { upsert: true }
      );
    }

    if (!pres_def_id && !dcql_query_id) {
      return res.status(400).json({ error: 'Either pres_def_id, pres_def, or dcql_query_id is required' });
    }

    const reqPayload = {
      vp_formats
    };
    if (pres_def_id) reqPayload.pres_def_id = pres_def_id;
    if (dcql_query_id) reqPayload.dcql_query_id = dcql_query_id;

    console.log('Sending /oid4vp/request to ACA-Py:', JSON.stringify(reqPayload, null, 2));

    const response = await client.post('/oid4vp/request', reqPayload);
    const data = response.data; // { presentation, request, request_uri }

    const presentation_id = data.presentation?.presentation_id;
    const request_id = data.request?.request_id;
    const request_uri = data.request_uri;

    // Save in MongoDB
    const savedRecord = await PresentationRecord.create({
      presentation_id,
      request_id,
      pres_def_id,
      request_uri,
      status: data.presentation?.state || 'request-created',
      verified: Boolean(data.presentation?.verified),
      verified_claims: data.presentation?.matched_credentials || {},
      matched_credentials: data.presentation?.matched_credentials || {},
      errors: data.presentation?.errors || [],
      raw_record: data
    });

    res.json({
      success: true,
      presentation_id,
      request_id,
      request_uri,
      presentationRecord: savedRecord,
      raw: data
    });
  } catch (err) {
    console.error('Create presentation request error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: formatError(err)
    });
  }
});

// Fetch All Presentation Records: GET /oid4vp/presentations
// IMPORTANT: This route must be registered BEFORE the :presentation_id route
app.get('/api/presentation/records', async (req, res) => {
  try {
    const { client } = await getAcapyClient();
    try {
      const liveRes = await client.get('/oid4vp/presentations');
      const liveItems = liveRes.data.results || [];
      for (const item of liveItems) {
        if (item && item.presentation_id) {
          const status = item.state || item.status || 'request-created';
          const verified = status === 'presentation-valid' || Boolean(item.verified);

          await PresentationRecord.findOneAndUpdate(
            { presentation_id: item.presentation_id },
            {
              presentation_id: item.presentation_id,
              request_id: item.request_id,
              pres_def_id: item.pres_def_id,
              status,
              verified,
              verified_claims: item.matched_credentials || {},
              matched_credentials: item.matched_credentials || {},
              errors: item.errors || [],
              raw_record: item,
              updatedAt: new Date()
            },
            { upsert: true }
          );
        }
      }
    } catch (acapyErr) {
      console.warn('Live ACA-Py fetch for presentations failed, using DB cache:', acapyErr.message);
    }

    const records = await PresentationRecord.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Single Presentation Status: GET /oid4vp/presentation/{presentation_id}
app.get('/api/presentation/records/:presentation_id', async (req, res) => {
  const { presentation_id } = req.params;
  try {
    const { client } = await getAcapyClient();
    let acapyData = null;

    try {
      const response = await client.get(`/oid4vp/presentation/${presentation_id}`);
      acapyData = response.data; // { presentation_id, status, verified_claims, errors }
    } catch (acapyErr) {
      console.warn(`Live ACA-Py fetch for presentation ${presentation_id} failed:`, acapyErr.message);
    }

    let localRecord = await PresentationRecord.findOne({ presentation_id });

    if (acapyData) {
      const status = acapyData.status || acapyData.state || (localRecord ? localRecord.status : 'unknown');
      const verified = status === 'presentation-valid' || Boolean(acapyData.verified);
      const verified_claims = acapyData.verified_claims || acapyData.matched_credentials || (localRecord ? localRecord.verified_claims : {});
      const errors = acapyData.errors || (localRecord ? localRecord.errors : []);

      localRecord = await PresentationRecord.findOneAndUpdate(
        { presentation_id },
        {
          status,
          verified,
          verified_claims,
          errors,
          raw_record: acapyData,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }

    if (!localRecord && !acapyData) {
      return res.status(404).json({ error: 'Presentation record not found' });
    }

    res.json(localRecord || acapyData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Presentation Record
app.delete('/api/presentation/records/:presentation_id', async (req, res) => {
  const { presentation_id } = req.params;
  try {
    const { client } = await getAcapyClient();
    try {
      await client.delete(`/oid4vp/presentation/${presentation_id}`);
    } catch (acapyErr) {
      console.warn(`Live ACA-Py delete for presentation ${presentation_id} failed:`, acapyErr.message);
    }

    await PresentationRecord.deleteOne({ presentation_id });
    res.json({ success: true, presentation_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend in production if built
if (process.env.NODE_ENV === 'production') {
  const frontendBuildPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
