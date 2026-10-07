import React, { useState, useEffect } from 'react';
import { Shield, Server, Palette } from 'lucide-react';
import axios from 'axios';

import ConfigTab from './components/ConfigTab';
import CreateCredTab from './components/CreateCredTab';
import CreateJwtVcTab from './components/CreateJwtVcTab';
import CreateMsoMdocTab from './components/CreateMsoMdocTab';
import StoredCredsTab from './components/StoredCredsTab';
import DidManagerTab from './components/DidManagerTab';
import CreateExchangeTab from './components/CreateExchangeTab';
import ProofPresentationTab from './components/ProofPresentationTab';

import themeEmerald from './theme.css?inline';
import themeTeal from './theme1.css?inline';

const THEME_MAP = {
  emerald: themeEmerald,
  teal: themeTeal
};

export default function App() {
  const [activeTab, setActiveTab] = useState('config');
  const [config, setConfig] = useState({
    acapyUrl: 'http://issuer:3001',
    bearerToken: '',
    adminApiKey: ''
  });
  const [storedCreds, setStoredCreds] = useState([]);
  const [didRecords, setDidRecords] = useState([]);
  const [selectedCredIdForExchange, setSelectedCredIdForExchange] = useState('');
  const [selectedDidForExchange, setSelectedDidForExchange] = useState('');

  // Available themes registry — easy to extend in the future
  const themes = [
    { id: 'emerald', name: 'Emerald (#005234)' },
    { id: 'teal', name: 'Teal (#015f63)' }
  ];

  const [activeTheme, setActiveTheme] = useState(() => {
    return localStorage.getItem('app_theme') || 'emerald';
  });

  // Switch dynamic theme CSS custom properties in document head
  useEffect(() => {
    localStorage.setItem('app_theme', activeTheme);
    const cssContent = THEME_MAP[activeTheme] || THEME_MAP.emerald;

    let styleElem = document.getElementById('dynamic-theme-style');
    if (!styleElem) {
      styleElem = document.createElement('style');
      styleElem.id = 'dynamic-theme-style';
      document.head.appendChild(styleElem);
    }
    styleElem.innerHTML = cssContent;
  }, [activeTheme]);

  // Fetch current backend configuration
  const fetchConfig = async () => {
    try {
      const res = await axios.get('/api/config');
      if (res.data) setConfig(res.data);
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  };

  // Fetch list of supported credentials stored in MongoDB
  const fetchStoredCreds = async () => {
    try {
      const res = await axios.get('/api/credential-supported/records');
      setStoredCreds(res.data);
    } catch (err) {
      console.error('Failed to fetch stored credentials:', err);
    }
  };

  // Fetch list of DIDs stored in MongoDB
  const fetchDidRecords = async () => {
    try {
      const res = await axios.get('/api/did/records');
      setDidRecords(res.data);
    } catch (err) {
      console.error('Failed to fetch DIDs:', err);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchStoredCreds();
    fetchDidRecords();
  }, []);

  const handleCredCreated = (credId) => {
    fetchStoredCreds();
    setSelectedCredIdForExchange(credId);
  };

  const handleSelectForExchange = (credId) => {
    setSelectedCredIdForExchange(credId);
    setActiveTab('exchange');
  };

  const handleSelectDidForExchange = (did) => {
    setSelectedDidForExchange(did);
    setActiveTab('exchange');
  };

  const isTokenConfigured = Boolean(config.bearerToken);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">
            <Shield className="w-6 h-6" />
          </div>
          <div className="brand-text">
            <h1>OID4VCI & OID4VP Credential Manager</h1>
            <p>SD-JWT Issuer & Verifier, DID Manager, Presentation & Offer QR Code System</p>
          </div>
        </div>

        <div className="status-bar">
          {/* Theme Switcher Dropdown (to the left of auth-server address) */}
          <div className="status-badge theme-switcher-badge" style={{ padding: '4px 10px' }}>
            <Palette className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
            <select
              value={activeTheme}
              onChange={(e) => setActiveTheme(e.target.value)}
              className="theme-select"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                outline: 'none',
                paddingRight: '4px'
              }}
            >
              {themes.map((t) => (
                <option key={t.id} value={t.id} style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="status-badge">
            <Server className="w-3.5 h-3.5 text-blue-400" />
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{config.acapyUrl}</span>
          </div>

          <div className="status-badge">
            <div className={`status-dot ${isTokenConfigured ? 'active' : ''}`} />
            <span>{isTokenConfigured ? 'Auth Configured' : 'No Token'}</span>
          </div>
        </div>
      </header>

      {/* Navigation: button + grouped dropdowns side-by-side */}
      <nav className="nav-dropdown-bar">

        {/* Button: Endpoint & Auth */}
        <button
          className={`nav-group-btn${activeTab === 'config' ? ' active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ Endpoint &amp; Auth
        </button>

        {/* Dropdown: Create Supported… */}
        <div className="nav-dropdown-wrapper">
          <select
            className={`nav-dropdown${['create-cred', 'create-jwt-vc', 'create-mso-mdoc'].includes(activeTab) ? ' active' : ''}`}
            value={['create-cred', 'create-jwt-vc', 'create-mso-mdoc'].includes(activeTab) ? activeTab : ''}
            onChange={(e) => { if (e.target.value) setActiveTab(e.target.value); }}
            aria-label="Create Supported Credential"
          >
            <option value="" disabled>📋 Create Supported…</option>
            <option value="create-cred">🔏 SD-JWT</option>
            <option value="create-jwt-vc">📄 JWT-VC</option>
            <option value="create-mso-mdoc">✅ mso-mdoc</option>
          </select>
          <span className="nav-dropdown-caret" aria-hidden="true">▾</span>
        </div>

        {/* Dropdown: Credentials & DIDs */}
        <div className="nav-dropdown-wrapper">
          <select
            className={`nav-dropdown${['stored-creds', 'dids'].includes(activeTab) ? ' active' : ''}`}
            value={['stored-creds', 'dids'].includes(activeTab) ? activeTab : ''}
            onChange={(e) => { if (e.target.value) setActiveTab(e.target.value); }}
            aria-label="Credentials and DIDs"
          >
            <option value="" disabled>🗄️ Credentials &amp; DIDs…</option>
            <option value="stored-creds">🗄️ Stored Credentials ({storedCreds.length})</option>
            <option value="dids">🔑 DIDs ({didRecords.length})</option>
          </select>
          <span className="nav-dropdown-caret" aria-hidden="true">▾</span>
        </div>

        {/* Dropdown: Exchange & Proof */}
        <div className="nav-dropdown-wrapper">
          <select
            className={`nav-dropdown${['exchange', 'presentation'].includes(activeTab) ? ' active' : ''}`}
            value={['exchange', 'presentation'].includes(activeTab) ? activeTab : ''}
            onChange={(e) => { if (e.target.value) setActiveTab(e.target.value); }}
            aria-label="Exchange and Presentation"
          >
            <option value="" disabled>🔄 Exchange &amp; Proof…</option>
            <option value="exchange">🔄 Create Exchange &amp; QR</option>
            <option value="presentation">🛡️ Proof Presentation</option>
          </select>
          <span className="nav-dropdown-caret" aria-hidden="true">▾</span>
        </div>

      </nav>


      {/* Main Tab Content */}
      <main>
        {activeTab === 'config' && (
          <ConfigTab config={config} fetchConfig={fetchConfig} />
        )}

        {activeTab === 'create-cred' && (
          <CreateCredTab onCredCreated={handleCredCreated} />
        )}

        {activeTab === 'create-jwt-vc' && (
          <CreateJwtVcTab onCredCreated={handleCredCreated} />
        )}

        {activeTab === 'create-mso-mdoc' && (
          <CreateMsoMdocTab onCredCreated={handleCredCreated} />
        )}

        {activeTab === 'stored-creds' && (
          <StoredCredsTab
            storedCreds={storedCreds}
            fetchStoredCreds={fetchStoredCreds}
            onSelectForExchange={handleSelectForExchange}
          />
        )}

        {activeTab === 'dids' && (
          <DidManagerTab
            didRecords={didRecords}
            fetchDidRecords={fetchDidRecords}
            onSelectDidForExchange={handleSelectDidForExchange}
          />
        )}

        {activeTab === 'exchange' && (
          <CreateExchangeTab
            selectedCredId={selectedCredIdForExchange}
            storedCreds={storedCreds}
            selectedDid={selectedDidForExchange}
            didRecords={didRecords}
            onExchangeCreated={() => fetchStoredCreds()}
          />
        )}

        {activeTab === 'presentation' && (
          <ProofPresentationTab storedCreds={storedCreds} />
        )}
      </main>
    </div>
  );
}
