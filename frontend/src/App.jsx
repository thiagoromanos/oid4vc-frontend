import React, { useState, useEffect } from 'react';
import { Shield, Server, FileCode, Database, RefreshCw, History, Key, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';

import ConfigTab from './components/ConfigTab';
import CreateCredTab from './components/CreateCredTab';
import StoredCredsTab from './components/StoredCredsTab';
import DidManagerTab from './components/DidManagerTab';
import CreateExchangeTab from './components/CreateExchangeTab';
import ExchangeHistoryTab from './components/ExchangeHistoryTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('config');
  const [config, setConfig] = useState({
    acapyUrl: 'http://localhost:8021',
    bearerToken: '',
    adminApiKey: ''
  });
  const [storedCreds, setStoredCreds] = useState([]);
  const [didRecords, setDidRecords] = useState([]);
  const [selectedCredIdForExchange, setSelectedCredIdForExchange] = useState('');
  const [selectedDidForExchange, setSelectedDidForExchange] = useState('');

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
            <h1>OID4VCI Credential Manager</h1>
            <p>SD-JWT Issuer, DID Manager (did:key / did:peer), Localization & Offer QR Code System</p>
          </div>
        </div>

        <div className="status-bar">
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

      {/* Navigation Tabs */}
      <nav className="nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          <Server className="w-4 h-4" /> Endpoint & Auth
        </button>

        <button
          className={`tab-btn ${activeTab === 'create-cred' ? 'active' : ''}`}
          onClick={() => setActiveTab('create-cred')}
        >
          <FileCode className="w-4 h-4" /> Create Supported SD-JWT
        </button>

        <button
          className={`tab-btn ${activeTab === 'stored-creds' ? 'active' : ''}`}
          onClick={() => setActiveTab('stored-creds')}
        >
          <Database className="w-4 h-4" /> Stored Credentials ({storedCreds.length})
        </button>

        <button
          className={`tab-btn ${activeTab === 'dids' ? 'active' : ''}`}
          onClick={() => setActiveTab('dids')}
        >
          <Key className="w-4 h-4" /> DIDs ({didRecords.length})
        </button>

        <button
          className={`tab-btn ${activeTab === 'exchange' ? 'active' : ''}`}
          onClick={() => setActiveTab('exchange')}
        >
          <RefreshCw className="w-4 h-4" /> Create Exchange & QR
        </button>

        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History className="w-4 h-4" /> Exchange History
        </button>
      </nav>

      {/* Main Tab Content */}
      <main>
        {activeTab === 'config' && (
          <ConfigTab config={config} fetchConfig={fetchConfig} />
        )}

        {activeTab === 'create-cred' && (
          <CreateCredTab onCredCreated={handleCredCreated} />
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

        {activeTab === 'history' && <ExchangeHistoryTab />}
      </main>
    </div>
  );
}
