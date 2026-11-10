import React, { useState, useEffect } from 'react';
import { RefreshCw, QrCode, Sparkles, CheckCircle, ShieldAlert, Copy, ExternalLink, Info, Code, History, Clock, ChevronDown, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

export default function CreateExchangeTab({ selectedCredId, storedCreds, selectedDid, didRecords = [], onExchangeCreated }) {
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'history'>('create');

  // ── Create Exchange state ──────────────────────────────────────────────────
  const [currentCredId, setCurrentCredId] = useState(selectedCredId || '');
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [credDefinition, setCredDefinition] = useState(null);
  const [attributeValues, setAttributeValues] = useState({});

  const [userPin, setUserPin] = useState('');
  const [did, setDid] = useState(selectedDid || '');
  const [showDidModal, setShowDidModal] = useState(false);
  const [customDidInput, setCustomDidInput] = useState('');

  const [creatingExchange, setCreatingExchange] = useState(false);
  const [exchangeResult, setExchangeResult] = useState(null);
  const [copiedOffer, setCopiedOffer] = useState(false);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  // ── Exchange History state ─────────────────────────────────────────────────
  const [exchanges, setExchanges] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchExchanges = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get('/api/exchange/records');
      setExchanges(res.data);
    } catch (err) {
      console.error('Failed to fetch exchanges:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'history') {
      fetchExchanges();
    }
  }, [activeSubTab]);

  const buildPayload = () => {
    const credential_subject = {};
    Object.keys(attributeValues).forEach((key) => {
      if (attributeValues[key] && attributeValues[key].trim() !== '') {
        credential_subject[key] = attributeValues[key].trim();
      }
    });

    const payload: any = {
      supported_cred_id: currentCredId,
      credential_subject: credential_subject
    };
    if (userPin.trim()) payload.pin = userPin.trim();
    if (did.trim()) {
       const issuerDid = did.trim();
       payload.did = issuerDid;
       const verificationMethodId = issuerDid.startsWith('did:key:')
         ? issuerDid.slice('did:key:'.length)
         : '0';
       payload.verification_method = `${issuerDid}#${verificationMethodId}`;
    }

    return payload;
  };

  useEffect(() => {
    if (selectedDid) {
      setDid(selectedDid);
    }
  }, [selectedDid]);

  useEffect(() => {
    if (selectedCredId) {
      setCurrentCredId(selectedCredId);
    } else if (storedCreds.length > 0 && !currentCredId) {
      setCurrentCredId(storedCreds[0].supported_cred_id);
    }
  }, [selectedCredId, storedCreds]);

  useEffect(() => {
    if (currentCredId) {
      fetchCredDefinition(currentCredId);
    }
  }, [currentCredId]);

  const fetchCredDefinition = async (credId: string) => {
    setLoadingDefinition(true);
    setCredDefinition(null);
    setExchangeResult(null);

    try {
      const res = await axios.get(`/api/credential-supported/records/${credId}`);
      const record = res.data;
      setCredDefinition(record);

      const initialValues: Record<string, string> = {};
      const claims = record.credential_metadata?.claims || [];

      if (claims.length > 0) {
        claims.forEach((claim: any) => {
          const key = Array.isArray(claim.path) ? claim.path[claim.path.length - 1] : claim.path;
          initialValues[key] = '';
        });
      } else if (record.sd_list && record.sd_list.length > 0) {
        record.sd_list.forEach((pointer: string) => {
          const key = pointer.replace(/^\//, '');
          initialValues[key] = '';
        });
      } else {
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

  const handleAttrChange = (key: string, val: string) => {
    setAttributeValues((prev) => ({
      ...prev,
      [key]: val
    }));
  };

  const handleCreateExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingExchange(true);
    setExchangeResult(null);

    try {
      const credential_subject: Record<string, string> = {};
      Object.keys(attributeValues).forEach((key) => {
        if (attributeValues[key].trim() !== '') {
          credential_subject[key] = attributeValues[key].trim();
        }
      });

      const payload: any = {
        supported_cred_id: currentCredId,
        credential_subject: credential_subject
      };
      if (userPin.trim()) payload.pin = userPin.trim();
      if (did.trim()) payload.did = did.trim();

      const res = await axios.post('/api/exchange/create', payload);
      setExchangeResult(res.data);
      if (onExchangeCreated) onExchangeCreated(res.data);
    } catch (err: any) {
      setExchangeResult({
        error: err.response?.data?.error || err.message
      });
    } finally {
      setCreatingExchange(false);
    }
  };

  const copyOfferToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedOffer(true);
    setTimeout(() => setCopiedOffer(false), 2000);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getClaimLabels = (key: string) => {
    const claims = credDefinition?.credential_metadata?.claims || [];
    const found = claims.find((c: any) => {
      const pathKey = Array.isArray(c.path) ? c.path[c.path.length - 1] : c.path;
      return pathKey === key;
    });

    if (!found || !found.display) return { en: key, pt: key };

    const en = found.display.find((d: any) => d.locale === 'en-US')?.name || key;
    const pt = found.display.find((d: any) => d.locale === 'pt-BR')?.name || key;
    return { en, pt };
  };

  return (
    <div className="tab-content">
      {/* Sub-navigation tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          type="button"
          className={`btn ${activeSubTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('create')}
        >
          <QrCode className="w-4 h-4" /> Create Exchange &amp; QR
        </button>
        <button
          type="button"
          className={`btn ${activeSubTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('history')}
        >
          <Clock className="w-4 h-4" /> Exchange History ({exchanges.length})
        </button>
      </div>

      {/* ── CREATE SUB-TAB ─────────────────────────────────────────────────── */}
      {activeSubTab === 'create' && (
        <>
          <div className="card">
            <div className="card-title">
              <RefreshCw className="w-5 h-5 text-purple-400" />
              <span>Create Credential Exchange &amp; Generate Offer QR</span>
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
                  {storedCreds.map((cred: any) => (
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

                    {/* Trigger button */}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomDidInput(
                          didRecords.some((d: any) => d.did === did) ? '' : did
                        );
                        setShowDidModal(true);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: did ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontFamily: did ? 'monospace' : 'inherit',
                        fontSize: '0.875rem',
                        minWidth: 0,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {did
                          ? did.length > 60
                            ? `${did.slice(0, 30)}…${did.slice(-20)}`
                            : did
                          : '-- None / Custom --'}
                      </span>
                      <ChevronDown className="w-4 h-4" style={{ flexShrink: 0, opacity: 0.6 }} />
                    </button>

                    {/* Clear button shown when a DID is selected */}
                    {did && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: '6px' }}
                        onClick={() => setDid('')}
                      >
                        <X className="w-3 h-3" /> Clear DID
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                  <button type="submit" className="btn btn-primary" disabled={creatingExchange}>
                    <Sparkles className="w-4 h-4" />
                    {creatingExchange ? 'Creating Exchange...' : 'Create Exchange & Generate QR Code'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowJsonPreview(!showJsonPreview)}
                  >
                    <Code className="w-4 h-4" />
                    {showJsonPreview ? 'Hide Payload JSON' : 'Preview Payload JSON'}
                  </button>
                </div>
              </form>
            ) : null}

            {showJsonPreview && (
              <div style={{ marginTop: '20px' }}>
                <h5 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Payload Preview to ACA-Py:</h5>
                <pre>{JSON.stringify(buildPayload(), null, 2)}</pre>
              </div>
            )}
          </div>

          {/* Exchange Result & Credential Offer QR Code Display */}
          {exchangeResult && (
            <div className="card" style={{ border: '1px solid rgba(139, 92, 246, 0.4)' }}>
              <div className="card-title">
                <QrCode className="w-5 h-5 text-purple-400" />
                <span>Credential Offer Result &amp; QR Code</span>
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
        </>
      )}

      {/* ── HISTORY SUB-TAB ────────────────────────────────────────────────── */}
      {activeSubTab === 'history' && (
        <>
          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <History className="w-5 h-5 text-blue-400" />
                <span>Exchange History</span>
              </div>

              <button className="btn btn-secondary btn-sm" onClick={fetchExchanges} disabled={loadingHistory}>
                <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            <p className="card-subtitle">
              List of all credential issuance exchange records stored in MongoDB.
            </p>

            {exchanges.length === 0 ? (
              <div className="banner banner-info">
                <Clock className="w-5 h-5" />
                <span>No exchanges created yet. Go to &quot;Create Exchange &amp; QR&quot; to issue credentials.</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {exchanges.map((ex: any) => (
                  <button
                    key={ex._id || ex.exchange_id}
                    type="button"
                    className="cred-card"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                    onClick={() => setSelectedExchange(ex)}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span className="badge badge-green">Exchange</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(ex.createdAt).toLocaleString()}</span>
                      </span>
                      <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                        <code style={{ color: 'var(--code-color)' }}>{ex.exchange_id}</code>
                      </strong>
                      <span style={{ display: 'block', marginTop: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Supported Cred: {ex.supported_cred_id}
                      </span>
                    </span>
                    <span style={{ flexShrink: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>View details <QrCode className="w-4 h-4" style={{ verticalAlign: 'middle', marginLeft: '6px' }} /></span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Exchange Details Modal */}
          {selectedExchange && (
            <div
              role="presentation"
              onClick={(event) => { if (event.target === event.currentTarget) setSelectedExchange(null); }}
              style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'rgba(0, 0, 0, 0.68)' }}
            >
              <div role="dialog" aria-modal="true" aria-labelledby="exchange-modal-title" className="card" style={{ width: 'min(100%, 960px)', maxHeight: '90vh', overflowY: 'auto', borderColor: 'var(--border-focus)', boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
                <div className="card-title" style={{ justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <QrCode className="w-5 h-5" />
                    <span id="exchange-modal-title">Exchange details</span>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedExchange(null)}>Close</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginTop: '20px' }}>
                  <div>
                    <p style={{ marginBottom: '14px', color: 'var(--text-secondary)' }}>Created {new Date(selectedExchange.createdAt).toLocaleString()}</p>
                    <p style={{ marginBottom: '14px', overflowWrap: 'anywhere' }}>Exchange ID: <code>{selectedExchange.exchange_id}</code></p>
                    <p style={{ marginBottom: '16px', overflowWrap: 'anywhere' }}>Supported Credential: <strong>{selectedExchange.supported_cred_id}</strong></p>
                    <div className="sub-card">
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Request payload</span>
                      <pre style={{ fontSize: '0.85rem', padding: '12px', maxHeight: '360px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {JSON.stringify(selectedExchange.request_payload || { supported_cred_id: selectedExchange.supported_cred_id, credential_subject: selectedExchange.credential_subject }, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    {selectedExchange.credential_offer ? (
                      <>
                        <div className="qr-wrapper" style={{ padding: '18px' }}>
                          <QRCodeSVG value={selectedExchange.credential_offer} size={260} level="M" includeMargin={true} />
                        </div>
                        <textarea readOnly aria-label="Credential offer URI" value={selectedExchange.credential_offer} rows={4} style={{ width: '100%', resize: 'vertical', fontSize: '0.75rem', fontFamily: 'monospace' }} />
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%' }}
                          onClick={() => copyToClipboard(selectedExchange.credential_offer, selectedExchange.exchange_id)}
                        >
                          {copiedId === selectedExchange.exchange_id ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copiedId === selectedExchange.exchange_id ? 'Copied Offer URI!' : 'Copy Offer URI'}
                        </button>
                      </>
                    ) : (
                      <div className="banner banner-info" style={{ width: '100%' }}><span>No credential offer string stored for this exchange.</span></div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {/* ── DID PICKER MODAL ───────────────────────────────────────────────── */}
      {showDidModal && (
        <div
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDidModal(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'rgba(0,0,0,0.70)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="did-picker-modal-title"
            className="card"
            style={{ width: 'min(100%, 680px)', maxHeight: '80vh', overflowY: 'auto', borderColor: 'var(--border-focus)', boxShadow: '0 24px 80px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', gap: 0 }}
          >
            {/* Header */}
            <div className="card-title" style={{ justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
              <span id="did-picker-modal-title" style={{ fontWeight: 600 }}>Select Holder / Issuance DID</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDidModal(false)}>
                <X className="w-4 h-4" /> Close
              </button>
            </div>

            {/* Stored DID rows */}
            {didRecords.length > 0 ? (
              <div style={{ display: 'grid', gap: '8px', marginBottom: '20px' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Stored DIDs</p>
                {didRecords.map((d: any) => (
                  <button
                    key={d.did}
                    type="button"
                    onClick={() => {
                      setDid(d.did);
                      setCustomDidInput('');
                      setShowDidModal(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '10px 14px',
                      background: did === d.did ? 'rgba(56,189,248,0.12)' : 'var(--card-bg, rgba(255,255,255,0.04))',
                      border: `1px solid ${did === d.did ? '#38bdf8' : 'var(--border-color, rgba(255,255,255,0.10))'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className="badge badge-green" style={{ flexShrink: 0 }}>{d.method || 'did'}</span>
                        {d.posture && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.posture}</span>}
                        {did === d.did && <CheckCircle className="w-3 h-3" style={{ color: '#38bdf8', flexShrink: 0 }} />}
                      </span>
                      <code style={{ fontSize: '0.78rem', color: 'var(--code-color, #38bdf8)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                        {d.did}
                      </code>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="banner banner-info" style={{ marginBottom: '16px' }}>
                <Info className="w-4 h-4" />
                <span>No stored DIDs found. Enter a custom DID below.</span>
              </div>
            )}

            {/* Divider */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Or enter a custom DID</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={customDidInput}
                  onChange={(e) => setCustomDidInput(e.target.value)}
                  placeholder="did:key:... or did:peer:..."
                  style={{ flex: 1 }}
                  autoFocus={didRecords.length === 0}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!customDidInput.trim()}
                  onClick={() => {
                    setDid(customDidInput.trim());
                    setShowDidModal(false);
                  }}
                >
                  Use
                </button>
              </div>
            </div>

            {/* None option */}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '12px', width: '100%' }}
              onClick={() => {
                setDid('');
                setCustomDidInput('');
                setShowDidModal(false);
              }}
            >
              <X className="w-4 h-4" /> Use none (clear)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
