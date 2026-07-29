import React, { useState } from 'react';
import { Server, Key, UserPlus, Copy, CheckCircle, ShieldAlert, Sparkles } from 'lucide-react';
import axios from 'axios';

export default function ConfigTab({ config, fetchConfig }) {
  const [acapyUrl, setAcapyUrl] = useState(config.acapyUrl || 'http://localhost:8021');
  const [bearerToken, setBearerToken] = useState(config.bearerToken || '');
  const [adminApiKey, setAdminApiKey] = useState(config.adminApiKey || '');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState(null);

  // Tenant creation state
  const [walletName, setWalletName] = useState(`tenant_${Math.floor(Math.random() * 10000)}`);
  const [walletKey, setWalletKey] = useState(`secret_${Math.floor(Math.random() * 100000)}`);
  const [walletLabel, setWalletLabel] = useState('My OID4VCI Tenant');
  const [walletType, setWalletType] = useState('askar');
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenantResult, setTenantResult] = useState(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigMessage(null);
    try {
      await axios.post('/api/config', {
        acapyUrl,
        bearerToken,
        adminApiKey
      });
      setConfigMessage({ type: 'success', text: 'Configuration saved successfully!' });
      fetchConfig();
    } catch (err) {
      setConfigMessage({ type: 'error', text: err.response?.data?.error || err.message });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    setCreatingTenant(true);
    setTenantResult(null);
    try {
      const res = await axios.post('/api/multitenancy/create-tenant', {
        wallet_name: walletName,
        wallet_key: walletKey,
        label: walletLabel,
        wallet_type: walletType,
        acapyUrl: acapyUrl,
        adminApiKey: adminApiKey
      });
      setTenantResult(res.data);
      setBearerToken(res.data.token);
      fetchConfig();
    } catch (err) {
      setTenantResult({ error: err.response?.data?.error || err.message });
    } finally {
      setCreatingTenant(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="tab-content">
      {/* ACA-Py Server & Auth Config */}
      <div className="card">
        <div className="card-title">
          <Server className="w-5 h-5 text-blue-400" />
          <span>ACA-Py Endpoint & Auth Configuration</span>
        </div>
        <p className="card-subtitle">
          Configure the target ACA-Py server URL and Bearer token for OID4VCI plugin operations.
        </p>

        {configMessage && (
          <div className={`banner ${configMessage.type === 'success' ? 'banner-success' : 'banner-error'}`}>
            {configMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            <span>{configMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveConfig}>
          <div className="form-grid">
            <div className="form-group">
              <label>ACA-Py Base URL</label>
              <input
                type="url"
                value={acapyUrl}
                onChange={(e) => setAcapyUrl(e.target.value)}
                placeholder="http://localhost:8021"
                required
              />
              <span className="label-hint">Base URL of your ACA-Py instance</span>
            </div>

            <div className="form-group">
              <label>Admin API Key (X-API-Key) <span className="label-hint">Optional</span></label>
              <input
                type="password"
                value={adminApiKey}
                onChange={(e) => setAdminApiKey(e.target.value)}
                placeholder="Admin API key if enabled on ACA-Py"
              />
            </div>

            <div className="form-group full-width">
              <label>Bearer Token (JWT / Subwallet Auth Token)</label>
              <input
                type="text"
                value={bearerToken}
                onChange={(e) => setBearerToken(e.target.value)}
                placeholder="eyJhbGciOi..."
              />
              <span className="label-hint">Used in Authorization header for tenant endpoints. You can also generate one below.</span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={savingConfig}>
            {savingConfig ? 'Saving...' : 'Save Configuration'}
          </button>
        </form>
      </div>

      {/* Multitenancy Tenant Creation */}
      <div className="card">
        <div className="card-title">
          <UserPlus className="w-5 h-5 text-purple-400" />
          <span>Create Tenant & Obtain Bearer Token</span>
        </div>
        <p className="card-subtitle">
          Use the ACA-Py Multitenancy endpoint (<code>POST /multitenancy/wallet</code> & <code>POST /multitenancy/wallet/{'{wallet_id}'}/token</code>) to provision a new subwallet and retrieve its Bearer Token.
        </p>

        <form onSubmit={handleCreateTenant}>
          <div className="form-grid">
            <div className="form-group">
              <label>Wallet / Tenant Name</label>
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Wallet Secret Key</label>
              <input
                type="text"
                value={walletKey}
                onChange={(e) => setWalletKey(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Display Label</label>
              <input
                type="text"
                value={walletLabel}
                onChange={(e) => setWalletLabel(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Wallet Type</label>
              <select value={walletType} onChange={(e) => setWalletType(e.target.value)}>
                <option value="askar">askar</option>
                <option value="askar-anoncreds">askar-anoncreds</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={creatingTenant}>
            <Sparkles className="w-4 h-4" />
            {creatingTenant ? 'Creating Tenant...' : 'Create Tenant & Provision Token'}
          </button>
        </form>

        {tenantResult && (
          <div className="attributes-section" style={{ marginTop: '24px' }}>
            {tenantResult.error ? (
              <div className="banner banner-error">
                <ShieldAlert className="w-5 h-5" />
                <div>
                  <strong>Tenant Creation Failed:</strong>
                  <pre style={{ marginTop: '8px' }}>{JSON.stringify(tenantResult.error, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <div className="banner banner-success" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <strong style={{ fontSize: '1rem' }}>Tenant Provisioned Successfully!</strong>
                </div>

                <div style={{ width: '100%' }}>
                  <p style={{ fontSize: '0.85rem', marginBottom: '6px', color: '#94a3b8' }}>
                    <strong>Wallet ID:</strong> {tenantResult.wallet_id}
                  </p>
                  <label style={{ marginBottom: '6px', color: '#f8fafc' }}>
                    Generated Bearer Token:
                  </label>
                  <div className="input-with-button">
                    <input type="text" readOnly value={tenantResult.token} style={{ background: '#090d16', color: '#38bdf8' }} />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyToClipboard(tenantResult.token)}
                    >
                      {copiedToken ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copiedToken ? 'Copied!' : 'Copy Token'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Tenant Summary */}
      {config.activeTenant && (
        <div className="card">
          <div className="card-title">
            <Key className="w-5 h-5 text-emerald-400" />
            <span>Active Tenant Session</span>
          </div>
          <div className="form-grid">
            <div>
              <span className="label-hint">Wallet Name:</span>
              <p style={{ fontWeight: 600 }}>{config.activeTenant.wallet_name}</p>
            </div>
            <div>
              <span className="label-hint">Wallet ID:</span>
              <p style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{config.activeTenant.wallet_id}</p>
            </div>
            <div>
              <span className="label-hint">Provisioned At:</span>
              <p>{new Date(config.activeTenant.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
