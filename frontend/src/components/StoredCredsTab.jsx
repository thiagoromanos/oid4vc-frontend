import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, Eye, ArrowRight, ShieldCheck, Tag, Layers } from 'lucide-react';
import axios from 'axios';

export default function StoredCredsTab({ storedCreds, fetchStoredCreds, onSelectForExchange }) {
  const [loading, setLoading] = useState(false);
  const [inspectingId, setInspectingId] = useState(null);
  const [inspectedRecord, setInspectedRecord] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStoredCreds();
  }, []);

  const handleInspect = async (supported_cred_id) => {
    setInspectingId(supported_cred_id);
    setInspectedRecord(null);
    setError(null);

    try {
      // Calls endpoint [GET]/oid4vci/credential-supported/records/{supported_cred_id}
      const res = await axios.get(`/api/credential-supported/records/${supported_cred_id}`);
      setInspectedRecord(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database className="w-5 h-5 text-emerald-400" />
            <span>Stored Supported Credentials</span>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={fetchStoredCreds}>
            <RefreshCw className="w-4 h-4" /> Refresh List
          </button>
        </div>
        <p className="card-subtitle">
          View all credential definitions stored in MongoDB and inspect live records from <code>GET /oid4vci/credential-supported/records/{'{supported_cred_id}'}</code>.
        </p>

        {storedCreds.length === 0 ? (
          <div className="banner banner-info">
            <Tag className="w-5 h-5" />
            <span>No supported credential records found in MongoDB yet. Create one in the "Create Supported SD-JWT" tab.</span>
          </div>
        ) : (
          <div className="cred-grid">
            {storedCreds.map((cred) => {
              const displayEn = cred.credential_metadata?.display?.find((d) => d.locale === 'en-US')?.name;
              const displayPt = cred.credential_metadata?.display?.find((d) => d.locale === 'pt-BR')?.name;
              const claimsCount = cred.credential_metadata?.claims?.length || 0;

              return (
                <div key={cred._id || cred.supported_cred_id} className="cred-card">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <span className="badge badge-green">{cred.format || 'vc+sd-jwt'}</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(cred.createdAt || Date.now()).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                      {cred.supported_cred_id}
                    </h3>

                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '12px' }}>
                      VCT: <code style={{ color: '#38bdf8' }}>{cred.vct}</code>
                    </p>

                    {(displayEn || displayPt) && (
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
                        {displayEn && <div style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>🇺🇸 {displayEn}</div>}
                        {displayPt && <div style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>🇧🇷 {displayPt}</div>}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
                      <span>🔑 {claimsCount} Attributes</span>
                      <span>•</span>
                      <span>🔒 {cred.sd_list?.length || 0} SD Fields</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => handleInspect(cred.supported_cred_id)}
                    >
                      <Eye className="w-4 h-4" /> Inspect Definition
                    </button>

                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onSelectForExchange(cred.supported_cred_id)}
                    >
                      Exchange <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inspection Modal / Detail Drawer */}
      {inspectingId && (
        <div className="card" style={{ border: '1px solid rgba(59, 130, 246, 0.4)' }}>
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck className="w-5 h-5 text-blue-400" />
              <span>Inspection of <code>{inspectingId}</code></span>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={() => setInspectingId(null)}>
              Close
            </button>
          </div>

          <p className="card-subtitle">
            Definition fetched live from ACA-Py endpoint: <code>GET /oid4vci/credential-supported/records/{inspectingId}</code>
          </p>

          {error && (
            <div className="banner banner-error">
              <span>Failed to fetch definition: {error}</span>
            </div>
          )}

          {inspectedRecord ? (
            <div>
              {/* Claims Breakdown */}
              {inspectedRecord.credential_metadata?.claims && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '10px' }}>
                    Defined Attributes & Localized Display Labels:
                  </h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {inspectedRecord.credential_metadata.claims.map((claim, i) => {
                      const attrKey = Array.isArray(claim.path) ? claim.path.join('.') : claim.path;
                      const enLabel = claim.display?.find((d) => d.locale === 'en-US')?.name;
                      const ptLabel = claim.display?.find((d) => d.locale === 'pt-BR')?.name;

                      return (
                        <div
                          key={i}
                          style={{
                            background: 'rgba(15, 23, 42, 0.7)',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            justify: 'space-between',
                            alignItems: 'center',
                            border: '1px solid rgba(255,255,255,0.05)'
                          }}
                        >
                          <div>
                            <strong style={{ color: '#38bdf8' }}>{attrKey}</strong>
                          </div>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                            {enLabel && <span>🇺🇸 <strong>{enLabel}</strong></span>}
                            {ptLabel && <span>🇧🇷 <strong>{ptLabel}</strong></span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <h4 style={{ fontSize: '0.9rem', color: '#cbd5e1', marginBottom: '8px' }}>Full Record JSON:</h4>
              <pre>{JSON.stringify(inspectedRecord, null, 2)}</pre>
            </div>
          ) : !error ? (
            <p style={{ color: '#94a3b8' }}>Loading record from ACA-Py...</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
