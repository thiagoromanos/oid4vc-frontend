import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldCheck, QrCode, RefreshCw, CheckCircle, AlertCircle, Copy, Info, Trash2, Clock, Check, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

export default function ProofPresentationTab({ storedCreds = [] }) {
  const [activeSubTab, setActiveSubTab] = useState('request'); // 'request' | 'history'

  // Form State
  const [selectedSupportedCredId, setSelectedSupportedCredId] = useState('');
  const [presDefId, setPresDefId] = useState(`pres_def_${Date.now()}`);
  const [name, setName] = useState('Proof Presentation Request');
  const [purpose, setPurpose] = useState('Verification of Verifiable Credentials');
  const [vctFilter, setVctFilter] = useState('');
  const [format, setFormat] = useState('vc+sd-jwt');

  // Active Presentation State
  const [creating, setCreating] = useState(false);
  const [presentationResult, setPresentationResult] = useState(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [pollingStatus, setPollingStatus] = useState(false);

  // History State
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Ref to track current presentation id for polling without re-creating intervals
  const presentationIdRef = useRef(null);

  // Auto-fill VCT filter when a supported credential is selected
  useEffect(() => {
    if (selectedSupportedCredId) {
      const found = storedCreds.find(c => c.supported_cred_id === selectedSupportedCredId);
      if (found) {
        if (found.vct) setVctFilter(found.vct);
        if (found.format) setFormat(found.format);
        setName(`Verification for ${found.supported_cred_id}`);
      }
    }
  }, [selectedSupportedCredId, storedCreds]);

  // Handle Create Presentation Request
  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setCreating(true);
    setPresentationResult(null);

    try {
      // Build presentation definition input descriptor
      const inputDescriptor = {
        id: `input_desc_${Date.now()}`,
        purpose: purpose || 'Verification',
        format: {
          [format]: {
            "sd-jwt_alg_values": ["ES256K", "EdDSA", "ES256", "ES384", "ES512"]
          }
        }
      };

      if (vctFilter.trim()) {
        inputDescriptor.constraints = {
          fields: [
            {
              path: ["$.vct"],
              filter: {
                type: "string",
                const: vctFilter.trim()
              }
            }
          ]
        };
      }

      const pres_def = {
        id: presDefId.trim() || `pres_def_${Date.now()}`,
        name: name.trim() || 'Presentation Definition',
        purpose: purpose.trim() || 'Verification',
        input_descriptors: [inputDescriptor]
      };

      const vp_formats = {
        [format]: {
          "sd-jwt_alg_values": ["ES256K", "EdDSA", "ES256"]
        }
      };

      // Call backend API /api/presentation-request/create
      const res = await axios.post('/api/presentation-request/create', {
        pres_def,
        vp_formats
      });

      const result = res.data;
      presentationIdRef.current = result.presentation_id;
      setPresentationResult(result);
      fetchHistory();
    } catch (err) {
      console.error('Failed to create presentation request:', err);
      setPresentationResult({
        error: err.response?.data?.error || err.message
      });
    } finally {
      setCreating(false);
    }
  };

  // Poll presentation status — uses ref to avoid stale closure issues
  const pollPresentationStatus = useCallback(async (presId) => {
    if (!presId) return;
    setPollingStatus(true);
    try {
      const res = await axios.get(`/api/presentation/records/${presId}`);
      if (res.data) {
        setPresentationResult(prev => {
          if (!prev) return null;
          return {
            ...prev,
            presentationRecord: res.data,
            status: res.data.status
          };
        });
      }
    } catch (err) {
      console.error('Status check error:', err);
    } finally {
      setPollingStatus(false);
    }
  }, []);

  // Auto-polling interval — uses ref to avoid re-creating intervals on every state change
  useEffect(() => {
    const presId = presentationIdRef.current;
    if (!presId) return;

    const currentStatus = presentationResult?.presentationRecord?.status || presentationResult?.status;
    if (currentStatus === 'presentation-valid' || currentStatus === 'presentation-invalid') {
      return; // Terminal state, stop polling
    }

    const interval = setInterval(() => {
      pollPresentationStatus(presId);
    }, 3000);

    return () => clearInterval(interval);
  }, [presentationResult?.presentationRecord?.status, presentationResult?.status, pollPresentationStatus]);

  // Fetch Presentation History
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get('/api/presentation/records');
      if (Array.isArray(res.data)) {
        setHistoryRecords(res.data);
      } else {
        setHistoryRecords([]);
      }
    } catch (err) {
      console.error('Failed to fetch presentation history:', err);
      setHistoryRecords([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'history') {
      fetchHistory();
    }
  }, [activeSubTab]);

  const handleDeletePresentation = async (presId) => {
    if (!window.confirm(`Delete presentation record ${presId}?`)) return;
    try {
      await axios.delete(`/api/presentation/records/${presId}`);
      fetchHistory();
      if (presentationResult?.presentation_id === presId) {
        presentationIdRef.current = null;
        setPresentationResult(null);
      }
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2000);
  };

  const renderStatusBadge = (status, verified) => {
    if (status === 'presentation-valid' || verified) {
      return (
        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Verified Valid
        </span>
      );
    }
    if (status === 'presentation-invalid') {
      return (
        <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <XCircle className="w-3.5 h-3.5 text-red-400" /> Verification Failed
        </span>
      );
    }
    if (status === 'request-retrieved') {
      return (
        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Clock className="w-3.5 h-3.5 text-amber-400" /> Wallet Retrieved Request
        </span>
      );
    }
    return (
      <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <Clock className="w-3.5 h-3.5 text-blue-400" /> Awaiting Wallet Presentation
      </span>
    );
  };

  return (
    <div className="tab-content">
      {/* Sub-navigation tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          type="button"
          className={`btn ${activeSubTab === 'request' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('request')}
        >
          <QrCode className="w-4 h-4" /> Request Proof (OID4VP)
        </button>
        <button
          type="button"
          className={`btn ${activeSubTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('history')}
        >
          <Clock className="w-4 h-4" /> Presentation History ({historyRecords.length})
        </button>
      </div>

      {activeSubTab === 'request' && (
        <div className="card">
          <div className="card-title">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <span>Create Proof Presentation Request (OID4VP)</span>
          </div>
          <p className="card-subtitle">
            Configure an OID4VP presentation definition request to receive and verify credentials (such as SD-JWT VCs) from a holder&#39;s wallet (e.g. Sphereon Wallet).
          </p>

          <form onSubmit={handleCreateRequest} style={{ marginBottom: '24px' }}>
            <div className="form-grid">
              {/* Optional Credential Template Auto-Fill */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Auto-fill from Supported Credential (Optional)</label>
                <select
                  value={selectedSupportedCredId}
                  onChange={(e) => setSelectedSupportedCredId(e.target.value)}
                >
                  <option value="">-- Custom Presentation Request --</option>
                  {storedCreds.map((cred) => (
                    <option key={cred.supported_cred_id} value={cred.supported_cred_id}>
                      {cred.supported_cred_id} ({cred.vct})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Presentation Definition ID</label>
                <input
                  type="text"
                  value={presDefId}
                  onChange={(e) => setPresDefId(e.target.value)}
                  placeholder="e.g. pres_def_university_degree"
                  required
                />
              </div>

              <div className="form-group">
                <label>Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="vc+sd-jwt">vc+sd-jwt (SD-JWT Verifiable Credential)</option>
                  <option value="jwt_vp">jwt_vp (W3C JWT Verifiable Presentation)</option>
                  <option value="mso_mdoc">mso_mdoc (Mobile Driving License / mDoc)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Request Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. University Degree Verification"
                  required
                />
              </div>

              <div className="form-group">
                <label>Purpose</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Verify graduation status for employment"
                  required
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Target VCT Filter (Verifiable Credential Type URI)</label>
                <input
                  type="text"
                  value={vctFilter}
                  onChange={(e) => setVctFilter(e.target.value)}
                  placeholder="e.g. https://credentials.example.com/university_degree"
                />
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                  If specified, the wallet will match credentials whose <code>vct</code> claim matches this exact value.
                </p>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating}
                style={{ background: 'var(--gradient-brand)' }}
              >
                <QrCode className={`w-4 h-4 ${creating ? 'animate-spin' : ''}`} />
                {creating ? 'Creating OID4VP Request...' : 'Generate Presentation QR Code'}
              </button>
            </div>
          </form>

          {/* Error Banner */}
          {presentationResult && presentationResult.error && (
            <div className="banner banner-danger" style={{ marginBottom: '20px' }}>
              <AlertCircle className="w-5 h-5" />
              <div>
                <strong>Error Creating Request:</strong>
                <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>{presentationResult.error}</p>
              </div>
            </div>
          )}

          {/* Active Presentation Result Card & QR Display */}
          {presentationResult && presentationResult.request_uri && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                marginTop: '24px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldCheck className="w-6 h-6 text-purple-400" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>
                    Active OID4VP Presentation Request
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {renderStatusBadge(
                    presentationResult.presentationRecord ? presentationResult.presentationRecord.status : presentationResult.status,
                    presentationResult.presentationRecord ? presentationResult.presentationRecord.verified : false
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => pollPresentationStatus(presentationResult.presentation_id)}
                    disabled={pollingStatus}
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${pollingStatus ? 'animate-spin' : ''}`} />
                    Refresh Status
                  </button>
                </div>
              </div>

              {/* QR Code and URI display */}
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div
                  style={{
                    background: 'white',
                    padding: '16px',
                    borderRadius: '16px',
                    display: 'inline-flex',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                  }}
                >
                  <QRCodeSVG
                    value={presentationResult.request_uri}
                    size={220}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <div style={{ flex: 1, minWidth: '280px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                    Scan with Wallet App
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.5 }}>
                    Open your wallet app (e.g., <strong>Sphereon Wallet</strong>), select <em>Scan QR</em>, and present the requested credential proof.
                  </p>

                  <div className="form-group">
                    <label>Presentation Request URI (request_uri)</label>
                    <div className="input-with-button">
                      <input
                        type="text"
                        readOnly
                        value={presentationResult.request_uri}
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => copyToClipboard(presentationResult.request_uri)}
                      >
                        {copiedUri ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copiedUri ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b' }}>
                    <strong>Presentation ID:</strong>{' '}
                    <code style={{ color: '#cbd5e1' }}>{presentationResult.presentation_id}</code>
                  </div>
                </div>
              </div>

              {/* Verified Claims / Presentation Results */}
              {presentationResult.presentationRecord &&
                (presentationResult.presentationRecord.status === 'presentation-valid' ||
                  presentationResult.presentationRecord.verified ||
                  (presentationResult.presentationRecord.verified_claims &&
                    Object.keys(presentationResult.presentationRecord.verified_claims).length > 0)) && (
                <div
                  style={{
                    marginTop: '24px',
                    padding: '16px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <h4 style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>
                    <CheckCircle className="w-5 h-5" /> Verified Presentation Claims Received
                  </h4>
                  <pre
                    style={{
                      background: '#090d16',
                      padding: '12px',
                      borderRadius: '8px',
                      color: '#a7f3d0',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      overflowX: 'auto',
                      maxHeight: '260px'
                    }}
                  >
                    {JSON.stringify(
                      presentationResult.presentationRecord.verified_claims ||
                      presentationResult.presentationRecord.matched_credentials ||
                      {},
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}

              {/* Errors section if presentation invalid */}
              {presentationResult.presentationRecord &&
                presentationResult.presentationRecord.errors &&
                presentationResult.presentationRecord.errors.length > 0 && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <h4 style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px' }}>
                    <AlertCircle className="w-4 h-4" /> Verification Errors
                  </h4>
                  <ul style={{ paddingLeft: '20px', color: '#fca5a5', fontSize: '0.85rem' }}>
                    {presentationResult.presentationRecord.errors.map((err, idx) => (
                      <li key={idx}>{typeof err === 'object' ? JSON.stringify(err) : err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History Sub-tab */}
      {activeSubTab === 'history' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="card-title" style={{ margin: 0 }}>
              <Clock className="w-5 h-5 text-blue-400" />
              <span>Proof Presentation Request History</span>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchHistory}
              disabled={loadingHistory}
            >
              <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loadingHistory ? (
            <div className="banner banner-info">
              <Info className="w-5 h-5" /> Loading presentation records...
            </div>
          ) : historyRecords.length === 0 ? (
            <div className="banner banner-info">
              <Info className="w-5 h-5" /> No presentation requests created yet. Use the &quot;Request Proof&quot; tab to generate one!
            </div>
          ) : (
            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                    <th style={{ padding: '12px' }}>Created</th>
                    <th style={{ padding: '12px' }}>Presentation ID</th>
                    <th style={{ padding: '12px' }}>Definition ID</th>
                    <th style={{ padding: '12px' }}>Status</th>
                    <th style={{ padding: '12px' }}>Verified Claims</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map((item) => (
                    <tr key={item.presentation_id || item._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px', fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#cbd5e1' }}>
                        {item.presentation_id ? item.presentation_id.substring(0, 16) + '...' : 'N/A'}
                      </td>
                      <td style={{ padding: '12px', fontSize: '0.85rem' }}>
                        {item.pres_def_id || 'N/A'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {renderStatusBadge(item.status, item.verified)}
                      </td>
                      <td style={{ padding: '12px', fontSize: '0.8rem' }}>
                        {item.verified_claims && Object.keys(item.verified_claims).length > 0 ? (
                          <span style={{ color: '#a7f3d0' }}>
                            {Object.keys(item.verified_claims).length} claims verified
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>None</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', marginRight: '6px' }}
                          onClick={() => {
                            presentationIdRef.current = item.presentation_id;
                            setPresentationResult({
                              presentation_id: item.presentation_id,
                              request_uri: item.request_uri,
                              presentationRecord: item
                            });
                            setActiveSubTab('request');
                          }}
                        >
                          <QrCode className="w-3.5 h-3.5" /> View QR / Details
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ef4444' }}
                          onClick={() => handleDeletePresentation(item.presentation_id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
