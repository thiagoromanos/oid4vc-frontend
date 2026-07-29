import React, { useState, useEffect } from 'react';
import { Key, Plus, RefreshCw, Copy, CheckCircle, ShieldAlert, Sparkles, Globe, Shield } from 'lucide-react';
import axios from 'axios';

export default function DidManagerTab({ didRecords, fetchDidRecords, onSelectDidForExchange }) {
  const [method, setMethod] = useState('key');
  const [keyType, setKeyType] = useState('ed25519');
  const [seed, setSeed] = useState('');
  const [creatingDid, setCreatingDid] = useState(false);
  const [result, setResult] = useState(null);
  const [copiedDid, setCopiedDid] = useState(null);
  const [settingPublic, setSettingPublic] = useState(null);

  useEffect(() => {
    fetchDidRecords();
  }, []);

  const handleCreateDid = async (e) => {
    e.preventDefault();
    setCreatingDid(true);
    setResult(null);

    try {
      const res = await axios.post('/api/did/create', {
        method,
        key_type: keyType,
        seed
      });
      setResult({ type: 'success', data: res.data });
      fetchDidRecords();
    } catch (err) {
      setResult({ type: 'error', error: err.response?.data?.error || err.message });
    } finally {
      setCreatingDid(false);
    }
  };

  const handleSetPublic = async (did) => {
    setSettingPublic(did);
    try {
      await axios.post('/api/did/set-public', { did });
      fetchDidRecords();
    } catch (err) {
      alert(`Failed to set public DID: ${err.response?.data?.error || err.message}`);
    } finally {
      setSettingPublic(null);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedDid(id);
    setTimeout(() => setCopiedDid(null), 2000);
  };

  return (
    <div className="tab-content">
      {/* Create DID Section */}
      <div className="card">
        <div className="card-title">
          <Key className="w-5 h-5 text-yellow-400" />
          <span>Create DID (Decentralized Identifier)</span>
        </div>
        <p className="card-subtitle">
          Provision DIDs for issuance and verification (such as <code>did:key</code>, <code>did:peer</code>, <code>did:jwk</code>) and store them in MongoDB.
        </p>

        {result && (
          <div className={`banner ${result.type === 'success' ? 'banner-success' : 'banner-error'}`}>
            {result.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            <div>
              {result.type === 'success' ? (
                <span>
                  DID <code>{result.data.didRecord?.did}</code> created and stored in MongoDB!
                </span>
              ) : (
                <span>
                  Failed to create DID: {typeof result.error === 'object' ? JSON.stringify(result.error) : result.error}
                </span>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleCreateDid}>
          <div className="form-grid">
            <div className="form-group">
              <label>DID Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="key">key (did:key)</option>
                <option value="peer">peer (did:peer)</option>
                <option value="jwk">jwk (did:jwk)</option>
                <option value="sov">sov (did:sov)</option>
              </select>
              <span className="label-hint">Primary methods supported by ACA-Py wallet</span>
            </div>

            <div className="form-group">
              <label>Key Type</label>
              <select value={keyType} onChange={(e) => setKeyType(e.target.value)}>
                <option value="ed25519">ed25519 (Recommended)</option>
                <option value="p256">p256 (NIST P-256)</option>
                <option value="bls12381g2">bls12381g2</option>
              </select>
            </div>

            <div className="form-group full-width">
              <label>Optional Seed <span className="label-hint">32-character seed string for deterministic DID derivation</span></label>
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Optional 32-character seed string..."
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={creatingDid}>
            <Sparkles className="w-4 h-4" />
            {creatingDid ? 'Creating DID...' : 'Generate & Store DID'}
          </button>
        </form>
      </div>

      {/* Stored DIDs Grid */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield className="w-5 h-5 text-emerald-400" />
            <span>Stored DIDs ({didRecords.length})</span>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={fetchDidRecords}>
            <RefreshCw className="w-4 h-4" /> Refresh DIDs
          </button>
        </div>
        <p className="card-subtitle">
          List of generated DIDs stored in MongoDB.
        </p>

        {didRecords.length === 0 ? (
          <div className="banner banner-info">
            <Key className="w-5 h-5" />
            <span>No DIDs created yet. Use the form above to generate a <code>did:key</code> or <code>did:peer</code>.</span>
          </div>
        ) : (
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {didRecords.map((d) => (
              <div key={d._id || d.did} className="cred-card">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span className={`badge ${d.posture === 'public' ? 'badge-green' : ''}`}>
                      {d.method ? `did:${d.method}` : 'did'} ({d.posture || 'wallet_only'})
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {new Date(d.createdAt || Date.now()).toLocaleDateString()}
                    </span>
                  </div>

                  <h4 style={{ fontSize: '0.85rem', fontFamily: 'monospace', wordBreak: 'break-all', color: '#38bdf8', marginBottom: '10px' }}>
                    {d.did}
                  </h4>

                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                    <p style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                      <strong>Key Type:</strong> {d.key_type}
                    </p>
                    {d.verkey && (
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', wordBreak: 'break-all', marginTop: '4px' }}>
                        <strong>Verkey:</strong> {d.verkey}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => copyToClipboard(d.did, d.did)}
                  >
                    {copiedDid === d.did ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    {copiedDid === d.did ? 'Copied' : 'Copy DID'}
                  </button>

                  {d.posture !== 'public' && d.method === 'sov' && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSetPublic(d.did)}
                      disabled={settingPublic === d.did}
                    >
                      <Globe className="w-4 h-4 text-blue-400" /> Set Public
                    </button>
                  )}

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => onSelectDidForExchange(d.did)}
                  >
                    Use in Exchange
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
