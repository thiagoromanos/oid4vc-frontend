import React, { useState, useEffect } from 'react';
import { History, RefreshCw, QrCode, Copy, CheckCircle, Clock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

export default function ExchangeHistoryTab() {
  const [exchanges, setExchanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const fetchExchanges = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/exchange/records');
      setExchanges(res.data);
    } catch (err) {
      console.error('Failed to fetch exchanges:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExchanges();
  }, []);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <History className="w-5 h-5 text-blue-400" />
            <span>Exchange History</span>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={fetchExchanges} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <p className="card-subtitle">
          List of all credential issuance exchange records stored in MongoDB.
        </p>

        {exchanges.length === 0 ? (
          <div className="banner banner-info">
            <Clock className="w-5 h-5" />
            <span>No exchanges created yet. Go to "Create Exchange & QR Code" to issue credentials.</span>
          </div>
        ) : (
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {exchanges.map((ex) => (
              <div key={ex._id || ex.exchange_id} className="cred-card">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="badge badge-green">Exchange</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {new Date(ex.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    ID: <code style={{ color: '#38bdf8' }}>{ex.exchange_id}</code>
                  </h4>

                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>
                    Supported Cred: <strong>{ex.supported_cred_id}</strong>
                  </p>

                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Subject Data:</span>
                    <pre style={{ fontSize: '0.75rem', padding: '6px' }}>
                      {JSON.stringify(ex.credential_subject, null, 2)}
                    </pre>
                  </div>
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%' }}
                  onClick={() => setSelectedExchange(ex)}
                >
                  <QrCode className="w-4 h-4 text-purple-400" /> View Offer QR Code
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Exchange QR Modal */}
      {selectedExchange && (
        <div className="card" style={{ border: '1px solid rgba(139, 92, 246, 0.4)' }}>
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <QrCode className="w-5 h-5 text-purple-400" />
              <span>Exchange Offer QR Code: <code>{selectedExchange.exchange_id}</code></span>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedExchange(null)}>
              Close
            </button>
          </div>

          {selectedExchange.credential_offer ? (
            <div className="qr-container" style={{ marginTop: '16px' }}>
              <div className="qr-wrapper">
                <QRCodeSVG value={selectedExchange.credential_offer} size={240} level="M" includeMargin={true} />
              </div>

              <div style={{ textAlign: 'center', width: '100%' }}>
                <input
                  type="text"
                  readOnly
                  value={selectedExchange.credential_offer}
                  style={{
                    width: '100%',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    marginBottom: '10px',
                    background: '#f1f5f9',
                    color: '#0f172a'
                  }}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', background: '#0f172a', color: '#ffffff' }}
                  onClick={() => copyToClipboard(selectedExchange.credential_offer, selectedExchange.exchange_id)}
                >
                  {copiedId === selectedExchange.exchange_id ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copiedId === selectedExchange.exchange_id ? 'Copied Offer URI!' : 'Copy Offer URI'}
                </button>
              </div>
            </div>
          ) : (
            <div className="banner banner-info">
              <span>No credential offer string stored for this exchange.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
