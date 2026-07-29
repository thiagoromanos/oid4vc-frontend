import React, { useState, useEffect } from 'react';
import { RefreshCw, QrCode, Sparkles, CheckCircle, ShieldAlert, Copy, ExternalLink, Info } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

export default function CreateExchangeTab({ selectedCredId, storedCreds, selectedDid, didRecords = [], onExchangeCreated }) {
  const [currentCredId, setCurrentCredId] = useState(selectedCredId || '');
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [credDefinition, setCredDefinition] = useState(null);
  const [attributeValues, setAttributeValues] = useState({});

  // Optional DID or PIN inputs
  const [userPin, setUserPin] = useState('');
  const [did, setDid] = useState(selectedDid || '');

  const [creatingExchange, setCreatingExchange] = useState(false);
  const [exchangeResult, setExchangeResult] = useState(null);
  const [copiedOffer, setCopiedOffer] = useState(false);

  useEffect(() => {
    if (selectedDid) {
      setDid(selectedDid);
    }
  }, [selectedDid]);

  // Update currentCredId when selectedCredId prop changes
  useEffect(() => {
    if (selectedCredId) {
      setCurrentCredId(selectedCredId);
    } else if (storedCreds.length > 0 && !currentCredId) {
      setCurrentCredId(storedCreds[0].supported_cred_id);
    }
  }, [selectedCredId, storedCreds]);

  // Fetch definition when currentCredId changes
  useEffect(() => {
    if (currentCredId) {
      fetchCredDefinition(currentCredId);
    }
  }, [currentCredId]);

  const fetchCredDefinition = async (credId) => {
    setLoadingDefinition(true);
    setCredDefinition(null);
    setExchangeResult(null);

    try {
      // Endpoint [GET] /oid4vci/credential-supported/records/{supported_cred_id}
      const res = await axios.get(`/api/credential-supported/records/${credId}`);
      const record = res.data;
      setCredDefinition(record);

      // Pre-fill attribute values map from defined claims
      const initialValues = {};
      const claims = record.credential_metadata?.claims || [];

      if (claims.length > 0) {
        claims.forEach((claim) => {
          const key = Array.isArray(claim.path) ? claim.path[0] : claim.path;
          initialValues[key] = '';
        });
      } else if (record.sd_list && record.sd_list.length > 0) {
        record.sd_list.forEach((pointer) => {
          const key = pointer.replace(/^\//, '');
          initialValues[key] = '';
        });
      } else {
        // Fallback default keys if no claims metadata is present
        initialValues['given_name'] = '';
        initialValues['family_name'] = '';
      }

      setAttributeValues(initialValues);
    } catch (err) {
      console.error('Failed to load credential definition:', err);
    } finally {
      setLoadingDefinition(false);
    }
  };

  const handleAttrChange = (key, val) => {
    setAttributeValues((prev) => ({
      ...prev,
      [key]: val
    }));
  };

  const handleCreateExchange = async (e) => {
    e.preventDefault();
    setCreatingExchange(true);
    setExchangeResult(null);

    try {
      // Build credential_subject object
      const credential_subject = {};
      Object.keys(attributeValues).forEach((key) => {
        if (attributeValues[key].trim() !== '') {
          credential_subject[key] = attributeValues[key].trim();
        }
      });

      const payload = {
        supported_cred_id: currentCredId,
        credential_subject: credential_subject
      };
      if (userPin.trim()) payload.pin = userPin.trim();
      if (did.trim()) payload.did = did.trim();

      // Send to backend which calls ACA-Py POST /oid4vci/exchange/create
      // and then GET /oid4vci/credential-offer
      const res = await axios.post('/api/exchange/create', payload);
      setExchangeResult(res.data);
      if (onExchangeCreated) onExchangeCreated(res.data);
    } catch (err) {
      setExchangeResult({
        error: err.response?.data?.error || err.message
      });
    } finally {
      setCreatingExchange(false);
    }
  };

  const copyOfferToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedOffer(true);
    setTimeout(() => setCopiedOffer(false), 2000);
  };

  // Helper to extract claim label from definition
  const getClaimLabels = (key) => {
    const claims = credDefinition?.credential_metadata?.claims || [];
    const found = claims.find((c) => {
      const pathKey = Array.isArray(c.path) ? c.path[0] : c.path;
      return pathKey === key;
    });

    if (!found || !found.display) return { en: key, pt: key };

    const en = found.display.find((d) => d.locale === 'en-US')?.name || key;
    const pt = found.display.find((d) => d.locale === 'pt-BR')?.name || key;
    return { en, pt };
  };

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-title">
          <RefreshCw className="w-5 h-5 text-purple-400" />
          <span>Create Credential Exchange & Generate Offer QR</span>
        </div>
        <p className="card-subtitle">
          Select a stored <code>supported_cred_id</code>, enter the credential subject values, and generate an exchange record with a <strong>Credential Offer QR Code</strong>.
        </p>

        {/* Credential Selection Dropdown */}
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label>Select Supported Credential (supported_cred_id)</label>
          <div className="input-with-button">
            <select
              value={currentCredId}
              onChange={(e) => setCurrentCredId(e.target.value)}
              style={{ flex: 1 }}
            >
              {storedCreds.map((cred) => (
                <option key={cred.supported_cred_id} value={cred.supported_cred_id}>
                  {cred.supported_cred_id} ({cred.vct})
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fetchCredDefinition(currentCredId)}
              disabled={loadingDefinition}
            >
              <RefreshCw className={`w-4 h-4 ${loadingDefinition ? 'animate-spin' : ''}`} />
              Reload Definition
            </button>
          </div>
        </div>

        {loadingDefinition ? (
          <div className="banner banner-info">
            <Info className="w-5 h-5" />
            <span>Fetching attributes from <code>GET /oid4vci/credential-supported/records/{currentCredId}</code>...</span>
          </div>
        ) : credDefinition ? (
          <form onSubmit={handleCreateExchange}>
            <div className="attributes-section" style={{ marginTop: 0, paddingTop: 0, border: 'none' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '16px', color: '#cbd5e1' }}>
                📝 Credential Subject Attributes (Values for Exchange)
              </h4>

              <div className="form-grid">
                {Object.keys(attributeValues).map((key) => {
                  const labels = getClaimLabels(key);
                  return (
                    <div key={key} className="form-group">
                      <label>
                        <span>
                          <strong style={{ color: '#38bdf8' }}>{key}</strong>
                        </span>
                        <span className="label-hint">
                          🇺🇸 {labels.en} | 🇧🇷 {labels.pt}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={attributeValues[key]}
                        onChange={(e) => handleAttrChange(key, e.target.value)}
                        placeholder={`Enter value for ${key}...`}
                        required
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Optional PIN / DID */}
            <div className="form-grid" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="form-group">
                <label>User PIN <span className="label-hint">Optional</span></label>
                <input
                  type="text"
                  value={userPin}
                  onChange={(e) => setUserPin(e.target.value)}
                  placeholder="e.g. 1234 (if pin required)"
                />
              </div>

              <div className="form-group">
                <label>Holder / Issuance DID <span className="label-hint">Optional (Select stored DID or enter custom)</span></label>
                {didRecords.length > 0 ? (
                  <div className="input-with-button">
                    <select
                      value={did}
                      onChange={(e) => setDid(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">-- Custom or None --</option>
                      {didRecords.map((d) => (
                        <option key={d.did} value={d.did}>
                          {d.did} ({d.method})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={did}
                      onChange={(e) => setDid(e.target.value)}
                      placeholder="did:key:... or did:peer:..."
                      style={{ flex: 1 }}
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={did}
                    onChange={(e) => setDid(e.target.value)}
                    placeholder="did:peer:... or did:key:..."
                  />
                )}
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <button type="submit" className="btn btn-primary" disabled={creatingExchange}>
                <Sparkles className="w-4 h-4" />
                {creatingExchange ? 'Creating Exchange...' : 'Create Exchange & Generate QR Code'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Exchange Result & Credential Offer QR Code Display */}
      {exchangeResult && (
        <div className="card" style={{ border: '1px solid rgba(139, 92, 246, 0.4)' }}>
          <div className="card-title">
            <QrCode className="w-5 h-5 text-purple-400" />
            <span>Credential Offer Result & QR Code</span>
          </div>

          {exchangeResult.error ? (
            <div className="banner banner-error">
              <ShieldAlert className="w-5 h-5" />
              <div>
                <strong>Exchange Creation Error:</strong>
                <pre style={{ marginTop: '8px' }}>
                  {typeof exchangeResult.error === 'object' ? JSON.stringify(exchangeResult.error, null, 2) : exchangeResult.error}
                </pre>
              </div>
            </div>
          ) : (
            <div>
              <div className="banner banner-success">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span>
                  Exchange <code>{exchangeResult.exchange_id}</code> created successfully!
                </span>
              </div>

              <div className="form-grid" style={{ marginBottom: '24px' }}>
                <div>
                  <span className="label-hint">Exchange ID:</span>
                  <p style={{ fontFamily: 'monospace', color: '#38bdf8', fontWeight: 600 }}>{exchangeResult.exchange_id}</p>
                </div>

                <div>
                  <span className="label-hint">Supported Cred ID:</span>
                  <p style={{ fontWeight: 600 }}>{currentCredId}</p>
                </div>
              </div>

              {/* QR Code Container */}
              {exchangeResult.credential_offer ? (
                <div className="qr-container">
                  <div className="qr-wrapper">
                    <QRCodeSVG
                      value={exchangeResult.credential_offer}
                      size={240}
                      level="M"
                      includeMargin={true}
                    />
                  </div>

                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '8px', wordBreak: 'break-all' }}>
                      <strong>Credential Offer URI:</strong>
                    </p>

                    <input
                      type="text"
                      readOnly
                      value={exchangeResult.credential_offer}
                      style={{
                        width: '100%',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        marginBottom: '10px',
                        background: '#f1f5f9',
                        color: '#0f172a',
                        border: '1px solid #cbd5e1'
                      }}
                    />

                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', background: '#0f172a', color: '#ffffff' }}
                      onClick={() => copyOfferToClipboard(exchangeResult.credential_offer)}
                    >
                      {copiedOffer ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copiedOffer ? 'Copied Offer URI!' : 'Copy Offer URI'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="banner banner-info">
                  <Info className="w-5 h-5" />
                  <span>Exchange created, but no credential_offer URI was returned by <code>GET /oid4vci/credential-offer</code>.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
