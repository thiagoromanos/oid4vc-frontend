import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldCheck, QrCode, RefreshCw, CheckCircle, AlertCircle, Copy, Info, Trash2, Clock, Check, XCircle, Plus, ChevronDown, ChevronUp, FileText, Bug, Code } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

export default function ProofPresentationTab({ storedCreds = [] }) {
  const [activeSubTab, setActiveSubTab] = useState('request'); // 'request' | 'history'

  // Form State
  const [selectedSupportedCredId, setSelectedSupportedCredId] = useState('');
  const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const [presDefId, setPresDefId] = useState(generateUUID);
  const [name, setName] = useState('Proof Presentation Request');
  const [purpose, setPurpose] = useState('Present basic profile info');
  const [vctFilter, setVctFilter] = useState('');
  const [format, setFormat] = useState('vc+sd-jwt');
  const [proofAlgValues, setProofAlgValues] = useState('ES256, ES384, ES256K, EdDSA');
  const [kbAlgValues, setKbAlgValues] = useState('ES256, ES384, ES256K, EdDSA');

  // Fields / Attributes to request in presentation definition
  const [requestedFields, setRequestedFields] = useState([]);
  const [newFieldName, setNewFieldName] = useState('');

  // Active Presentation State
  const [creating, setCreating] = useState(false);
  const [presentationResult, setPresentationResult] = useState(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [pollingStatus, setPollingStatus] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);

  // History State
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Ref to track current presentation id for polling without re-creating intervals
  const presentationIdRef = useRef(null);

  // Helper to clean attribute names into valid JSONPath property names
  const cleanFieldName = (f) => {
    if (!f) return '';
    let str = String(f).trim();
    str = str.replace(/^\/+/, ''); // Remove leading slashes like /given_name -> given_name
    str = str.replace(/^\$\./, ''); // Remove leading $. if user typed $.given_name
    return str;
  };

  // Auto-fill VCT filter & attributes when a supported credential is selected
  useEffect(() => {
    if (selectedSupportedCredId) {
      const found = storedCreds.find(c => c.supported_cred_id === selectedSupportedCredId);
      if (found) {
        console.log('[DEBUG FRONTEND] Selected supported credential for presentation auto-fill:', found);
        if (found.vct) setVctFilter(found.vct);
        if (found.format) setFormat(found.format);
        setName(`Verification for ${found.supported_cred_id}`);

        // Extract attributes from sd_list or raw_record if present
        let extractedFields = [];
        if (Array.isArray(found.sd_list) && found.sd_list.length > 0) {
          extractedFields = found.sd_list.map(cleanFieldName).filter(Boolean);
        } else if (found.credential_metadata && found.credential_metadata.claims) {
          extractedFields = Object.keys(found.credential_metadata.claims).map(cleanFieldName).filter(Boolean);
        }

        if (extractedFields.length > 0) {
          setRequestedFields(extractedFields);
        }
      }
    }
  }, [selectedSupportedCredId, storedCreds]);

  const addRequestedField = () => {
    const cleaned = cleanFieldName(newFieldName);
    if (cleaned && !requestedFields.includes(cleaned)) {
      setRequestedFields([...requestedFields, cleaned]);
      setNewFieldName('');
    }
  };

  const removeRequestedField = (fieldToRemove) => {
    setRequestedFields(requestedFields.filter(f => f !== fieldToRemove));
  };

  // Helper to construct request payload preview
  const buildPayload = () => {
    let pres_def = null;
    let vp_formats = null;

    const parsedProofAlgs = proofAlgValues.split(',').map(a => a.trim()).filter(Boolean);
    const parsedKbAlgs = kbAlgValues.split(',').map(a => a.trim()).filter(Boolean);

    if (format === 'mso_mdoc') {
      const claims = requestedFields.length > 0
        ? requestedFields.map(f => ({ namespace: "org.iso.18013.5.1", claim_name: cleanFieldName(f) }))
        : [
            { namespace: "org.iso.18013.5.1", claim_name: "family_name" },
            { namespace: "org.iso.18013.5.1", claim_name: "given_name" },
            { namespace: "org.iso.18013.5.1", claim_name: "document_number" },
            { namespace: "org.iso.18013.5.1", claim_name: "issuing_country" },
            { namespace: "org.iso.18013.5.1", claim_name: "expiry_date" }
          ];

      vp_formats = { "mso_mdoc": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256"] } };
      return {
        dcql_query: { credentials: [{ id: "mDL", format: "mso_mdoc", meta: { doctype_value: "org.iso.18013.5.1.mDL" }, claims }] },
        vp_formats
      };
    } else if (format === 'jwt_vp' || format === 'jwt_vc' || format === 'jwt_vc_json') {
      const fields = requestedFields.length > 0
        ? requestedFields.map(f => {
            const clean = cleanFieldName(f);
            return {
              name: clean,
              path: [`$.vc.credentialSubject.${clean}`, `$.credentialSubject.${clean}`],
              filter: { type: "string", pattern: "^.{1,64}$" }
            };
          })
        : [
            { name: "name", path: ["$.vc.credentialSubject.first_name", "$.credentialSubject.first_name"], filter: { type: "string", pattern: "^.{1,64}$" } },
            { name: "lastname", path: ["$.vc.credentialSubject.last_name", "$.credentialSubject.last_name"], filter: { type: "string", pattern: "^.{1,64}$" } }
          ];

      pres_def = {
        id: presDefId.trim() || 'pres_def_id',
        purpose: purpose.trim() || 'Present basic profile info',
        format: {
          "jwt_vc_json": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256"] },
          "jwt_vp_json": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256"] },
          "jwt_vc": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256"] },
          "jwt_vp": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256"] }
        },
        input_descriptors: [
          {
            id: 'input_descriptor_1',
            name: name.trim() || 'Profile',
            purpose: purpose.trim() || 'Present basic profile info',
            constraints: { fields: fields }
          }
        ]
      };

      vp_formats = {
        "jwt_vc": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256", "EdDSA"] },
        "jwt_vp": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256", "EdDSA"] },
        "jwt_vc_json": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256", "EdDSA"] },
        "jwt_vp_json": { "alg": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256", "EdDSA"] }
      };

      return { pres_def, vp_formats };
    } else {
      const fields = [
        {
          path: ["$.vct"],
          filter: {
            type: "string",
            ...(vctFilter.trim() ? { pattern: `^${vctFilter.trim()}$` } : {})
          }
        }
      ];

      requestedFields.forEach(field => {
        const clean = cleanFieldName(field);
        if (clean && clean !== 'vct') {
          fields.push({ path: [`$.${clean}`] });
        }
      });

      const inputDescriptor = {
        id: "ID Card",
        name: name.trim() || 'Profile',
        purpose: purpose.trim() || 'Present basic profile info',
        format: { "vc+sd-jwt": {} },
        constraints: {
          limit_disclosure: "required",
          fields: fields
        }
      };

      pres_def = {
        id: presDefId.trim() || 'pres_def_id',
        name: name.trim() || 'Presentation Definition',
        purpose: purpose.trim() || 'Present basic profile info',
        input_descriptors: [inputDescriptor]
      };

      vp_formats = {
        "vc+sd-jwt": {
          "sd-jwt_alg_values": parsedProofAlgs.length > 0 ? parsedProofAlgs : ["ES256", "ES384"],
          "kb-jwt_alg_values": parsedKbAlgs.length > 0 ? parsedKbAlgs : ["ES256", "ES384"]
        }
      };

      return { pres_def };
    }
  };

  // Handle Create Presentation Request matching acapy-plugins reference demo EXACTLY
  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setCreating(true);
    setPresentationResult(null);
    setShowRawJson(false);

    try {
      let pres_def = null;
      let vp_formats = null;
      let dcql_query_id = null;

      if (format === 'mso_mdoc') {
        const payloadData = buildPayload();
        const dcqlRes = await axios.post('/api/dcql-query/create', payloadData.dcql_query);
        dcql_query_id = dcqlRes.data.dcql_query_id;
        vp_formats = payloadData.vp_formats;
      } else {
        const payloadData = buildPayload();
        pres_def = payloadData.pres_def;
        vp_formats = payloadData.vp_formats;
      }

      console.log('[DEBUG FRONTEND] Creating presentation request:', { pres_def, dcql_query_id, vp_formats });

      const res = await axios.post('/api/presentation-request/create', {
        pres_def,
        dcql_query_id,
        vp_formats
      });

      console.log('[DEBUG FRONTEND] Presentation request created successfully:', res.data);
      const result = res.data;
      presentationIdRef.current = result.presentation_id;
      setPresentationResult(result);
      fetchHistory();
    } catch (err) {
      console.error('[DEBUG FRONTEND] Failed to create presentation request:', err);
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
      console.log(`[DEBUG FRONTEND] Poll presentation status for ${presId}:`, res.data);
      if (res.data) {
        setPresentationResult(prev => {
          if (!prev) {
            return {
              presentation_id: presId,
              presentationRecord: res.data,
              status: res.data.status || res.data.state
            };
          }
          return {
            ...prev,
            presentationRecord: res.data,
            status: res.data.status || res.data.state
          };
        });
      }
    } catch (err) {
      console.error('[DEBUG FRONTEND] Status check error:', err);
    } finally {
      setPollingStatus(false);
    }
  }, []);

  // Get current record normalized
  const getCurrentRecord = () => {
    if (!presentationResult) return null;
    return presentationResult.presentationRecord || presentationResult;
  };

  const currentRecord = getCurrentRecord();
  const currentStatus = currentRecord?.status || currentRecord?.state || presentationResult?.status;
  const isTerminalState = currentStatus === 'presentation-valid' || currentStatus === 'presentation-invalid';

  // Auto-polling interval
  useEffect(() => {
    const presId = presentationIdRef.current;
    if (!presId || isTerminalState) return;

    const interval = setInterval(() => {
      pollPresentationStatus(presId);
    }, 2000);

    return () => clearInterval(interval);
  }, [isTerminalState, pollPresentationStatus, presentationResult]);

  // Fetch Presentation History
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get('/api/presentation/records');
      console.log('[DEBUG FRONTEND] Presentation history response:', res.data);
      if (Array.isArray(res.data)) {
        setHistoryRecords(res.data);
      } else {
        setHistoryRecords([]);
      }
    } catch (err) {
      console.error('[DEBUG FRONTEND] Failed to fetch presentation history:', err);
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
      if (presentationResult?.presentation_id === presId || presentationIdRef.current === presId) {
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
        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.85rem' }}>
          <CheckCircle className="w-4 h-4 text-emerald-400" /> Verified Valid
        </span>
      );
    }
    if (status === 'presentation-invalid') {
      return (
        <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.85rem' }}>
          <XCircle className="w-4 h-4 text-red-400" /> Verification Failed
        </span>
      );
    }
    if (status === 'request-retrieved') {
      return (
        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.85rem' }}>
          <Clock className="w-4 h-4 text-amber-400 animate-pulse" /> Wallet Retrieved Request
        </span>
      );
    }
    return (
      <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.85rem' }}>
        <Clock className="w-4 h-4 text-blue-400 animate-spin" /> Awaiting Wallet Presentation
      </span>
    );
  };

  // Helper to extract claims from record
  const getReceivedClaims = (rec) => {
    if (!rec) return {};
    const rawClaims = rec.verified_claims || rec.matched_credentials || {};
    if (typeof rawClaims !== 'object' || rawClaims === null) return {};

    // If claims are nested inside input descriptor keys (e.g. { "ID Card": { ...claims } })
    const keys = Object.keys(rawClaims);
    if (keys.length === 1 && typeof rawClaims[keys[0]] === 'object' && rawClaims[keys[0]] !== null && !Array.isArray(rawClaims[keys[0]])) {
      return rawClaims[keys[0]];
    }

    return rawClaims;
  };

  const receivedClaims = getReceivedClaims(currentRecord);
  const hasClaims = Object.keys(receivedClaims).length > 0;

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
            Configure an OID4VP presentation definition request to receive and verify credentials (such as SD-JWT VCs) from a holder&#39;s wallet (e.g. Paradym Wallet / Sphereon Wallet).
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
                  placeholder="e.g. Profile"
                  required
                />
              </div>

              <div className="form-group">
                <label>Purpose</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Present basic profile info"
                  required
                />
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Target VCT Filter (Verifiable Credential Type)</label>
                <input
                  type="text"
                  value={vctFilter}
                  onChange={(e) => setVctFilter(e.target.value)}
                  placeholder="e.g. ExampleIDCard or https://example.com/id"
                />
              </div>

              <div className="form-group">
                <label>Supported Proof Algorithms (sd-jwt_alg_values / alg)</label>
                <input
                  type="text"
                  value={proofAlgValues}
                  onChange={(e) => setProofAlgValues(e.target.value)}
                  placeholder="ES256, ES384, ES256K, EdDSA"
                  required
                />
              </div>

              <div className="form-group">
                <label>Key Binding Algorithms (kb-jwt_alg_values)</label>
                <input
                  type="text"
                  value={kbAlgValues}
                  onChange={(e) => setKbAlgValues(e.target.value)}
                  placeholder="ES256, ES384, ES256K, EdDSA"
                  required
                />
              </div>

              {/* Requested Claims / Attributes Builder */}
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Requested Credential Attributes / Claims (Optional)</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Attribute key (e.g. given_name, family_name)"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addRequestedField();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addRequestedField}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <Plus className="w-4 h-4" /> Add Field
                  </button>
                </div>

                {requestedFields.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {requestedFields.map((field) => (
                      <span
                        key={field}
                        style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          borderRadius: '20px',
                          padding: '4px 12px',
                          fontSize: '0.85rem',
                          color: '#c7d2fe',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <code>$.{cleanFieldName(field)}</code>
                        <button
                          type="button"
                          onClick={() => removeRequestedField(field)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#f87171',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Remove field"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                    Matches standard SD-JWT credentials. The verifier will verify issuer signature, key binding, and nonces.
                  </p>
                )}
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPayloadPreview(!showPayloadPreview)}
              >
                <Code className="w-4 h-4" />
                {showPayloadPreview ? 'Hide Payload JSON' : 'Preview Payload JSON'}
              </button>

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

          {showPayloadPreview && (
            <div style={{ marginTop: '20px', marginBottom: '20px' }}>
              <h5 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Payload Preview to ACA-Py:</h5>
              <pre>{JSON.stringify(buildPayload(), null, 2)}</pre>
            </div>
          )}

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
          {presentationResult && (presentationResult.request_uri || presentationResult.presentation_id) && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                marginTop: '24px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldCheck className="w-6 h-6 text-purple-400" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white', margin: 0 }}>
                    Active OID4VP Presentation Request
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {renderStatusBadge(currentStatus, currentRecord?.verified)}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => pollPresentationStatus(presentationResult.presentation_id || currentRecord?.presentation_id)}
                    disabled={pollingStatus}
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${pollingStatus ? 'animate-spin' : ''}`} />
                    Refresh Status
                  </button>
                </div>
              </div>

              {/* QR Code and URI display */}
              {presentationResult.request_uri && (
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
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
                      Scan with Wallet App (Paradym / Sphereon)
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.5 }}>
                      Open your wallet app, select <em>Scan QR</em>, and present the requested credential proof.
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

                    <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <strong>Presentation ID:</strong>{' '}
                        <code style={{ color: '#cbd5e1' }}>{presentationResult.presentation_id || currentRecord?.presentation_id}</code>
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => setShowRawJson(!showRawJson)}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {showRawJson ? 'Hide Request Response JSON' : 'View Request Response JSON'}
                        {showRawJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {showRawJson && (
                      <div style={{ marginTop: '14px' }}>
                        <h5 style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>Presentation Request ACA-Py Response:</h5>
                        <pre style={{ maxHeight: '250px', overflowY: 'auto' }}>
                          {JSON.stringify(presentationResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUCCESS RESULT CARD: Verified Data Received from Holder */}
              {(currentStatus === 'presentation-valid' || currentRecord?.verified || hasClaims) && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '20px',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.1)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h4 style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                      Presentation Verified &amp; Data Received from Holder
                    </h4>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowRawJson(!showRawJson)}
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {showRawJson ? 'Hide Raw JSON' : 'View Raw JSON'}
                      {showRawJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Formatted Claims Table */}
                  {hasClaims ? (
                    <div style={{ background: '#090d16', borderRadius: '8px', padding: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>Claim / Attribute</th>
                            <th style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>Presented Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(receivedClaims).map(([key, val]) => (
                            <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#e2e8f0', fontSize: '0.85rem' }}>
                                <code>{key}</code>
                              </td>
                              <td style={{ padding: '10px 12px', color: '#a7f3d0', fontSize: '0.85rem', fontFamily: typeof val === 'object' ? 'monospace' : 'inherit' }}>
                                {typeof val === 'object' && val !== null ? (
                                  <pre style={{ margin: 0, fontSize: '0.8rem', color: '#a7f3d0' }}>
                                    {JSON.stringify(val, null, 2)}
                                  </pre>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: '#a7f3d0' }}>
                      Presentation verified successfully.
                    </p>
                  )}

                  {/* Optional Raw JSON Inspector */}
                  {showRawJson && (
                    <div style={{ marginTop: '16px' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px', display: 'block' }}>
                        Raw Verified Claims &amp; ACA-Py Record:
                      </label>
                      <pre
                        style={{
                          background: '#040711',
                          padding: '12px',
                          borderRadius: '8px',
                          color: '#6ee7b7',
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                          overflowX: 'auto',
                          maxHeight: '300px'
                        }}
                      >
                        {JSON.stringify(currentRecord, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Errors section if presentation invalid */}
              {(currentStatus === 'presentation-invalid' || (currentRecord?.errors && currentRecord.errors.length > 0)) && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <h4 style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px', margin: 0 }}>
                    <AlertCircle className="w-4 h-4" /> Verification Failed / Errors
                  </h4>
                  <ul style={{ paddingLeft: '20px', color: '#fca5a5', fontSize: '0.85rem', marginTop: '8px' }}>
                    {currentRecord?.errors && currentRecord.errors.length > 0 ? (
                      currentRecord.errors.map((err, idx) => (
                        <li key={idx}>{typeof err === 'object' ? JSON.stringify(err) : String(err)}</li>
                      ))
                    ) : (
                      <li>Holder presentation failed or did not match descriptor constraints.</li>
                    )}
                  </ul>

                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowRawJson(!showRawJson)}
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                    >
                      <Bug className="w-3.5 h-3.5" />
                      {showRawJson ? 'Hide Debug Details' : 'View Debug Details / Raw Record'}
                    </button>
                    {showRawJson && (
                      <pre
                        style={{
                          marginTop: '8px',
                          background: '#040711',
                          padding: '12px',
                          borderRadius: '8px',
                          color: '#fca5a5',
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                          overflowX: 'auto',
                          maxHeight: '300px'
                        }}
                      >
                        {JSON.stringify(currentRecord, null, 2)}
                      </pre>
                    )}
                  </div>
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
                  {historyRecords.map((item) => {
                    const claimsObj = getReceivedClaims(item);
                    const claimCount = Object.keys(claimsObj).length;

                    return (
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
                          {claimCount > 0 ? (
                            <span style={{ color: '#a7f3d0', fontWeight: 600 }}>
                              {claimCount} claims received
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
                            <QrCode className="w-3.5 h-3.5" /> View Details
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
