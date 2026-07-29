import React, { useState } from 'react';
import { FileCode, Plus, Trash2, CheckCircle, ShieldAlert, Code, Sparkles, Image, Palette } from 'lucide-react';
import axios from 'axios';

export default function CreateCredTab({ onCredCreated }) {
  const [credId, setCredId] = useState('IdentityCardCredential');
  const [vct, setVct] = useState('https://example.com/identity-card');
  const [format, setFormat] = useState('vc+sd-jwt');
  const [signingAlg, setSigningAlg] = useState('ES256K');
  const [bindingMethod, setBindingMethod] = useState('did');

  // Fully customizable credential_metadata.display entries
  const [displays, setDisplays] = useState([
    {
      name: 'National Identity Card',
      locale: 'en-US',
      background_color: '#1e293b',
      text_color: '#ffffff',
      logoUrl: '',
      logoAltText: ''
    },
    {
      name: 'Carteira de Identidade Nacional',
      locale: 'pt-BR',
      background_color: '#1e293b',
      text_color: '#ffffff',
      logoUrl: '',
      logoAltText: ''
    }
  ]);

  // Dynamic attributes list
  const [attributes, setAttributes] = useState([
    { name: 'given_name', labelEn: 'Given Name', labelPt: 'Primeiro Nome', isSd: true },
    { name: 'family_name', labelEn: 'Surname / Family Name', labelPt: 'Sobrenome', isSd: true },
    { name: 'email', labelEn: 'Email Address', labelPt: 'Endereço de E-mail', isSd: true },
    { name: 'birthdate', labelEn: 'Date of Birth', labelPt: 'Data de Nascimento', isSd: true },
    { name: 'national_id', labelEn: 'National ID Number', labelPt: 'Número de CPF / RG', isSd: false }
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  // --- Display Entries Handlers ---
  const addDisplayEntry = () => {
    setDisplays([
      ...displays,
      {
        name: '',
        locale: 'es-ES',
        background_color: '#1e293b',
        text_color: '#ffffff',
        logoUrl: '',
        logoAltText: ''
      }
    ]);
  };

  const removeDisplayEntry = (index) => {
    setDisplays(displays.filter((_, i) => i !== index));
  };

  const updateDisplayEntry = (index, field, value) => {
    const updated = [...displays];
    updated[index][field] = value;
    setDisplays(updated);
  };

  // --- Attribute Handlers ---
  const addAttribute = () => {
    setAttributes([
      ...attributes,
      { name: `attr_${attributes.length + 1}`, labelEn: '', labelPt: '', isSd: true }
    ]);
  };

  const removeAttribute = (index) => {
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const updateAttribute = (index, field, value) => {
    const updated = [...attributes];
    updated[index][field] = value;
    setAttributes(updated);
  };

  // Construct ACA-Py payload according to swagger SdJwtSupportedCredCreateReq
  const buildPayload = () => {
    const sd_list = attributes
      .filter((attr) => attr.isSd && attr.name.trim())
      .map((attr) => (attr.name.startsWith('/') ? attr.name : `/${attr.name.trim()}`));

    const claims = attributes
      .filter((attr) => attr.name.trim())
      .map((attr) => ({
        path: [attr.name.trim()],
        display: [
          { name: attr.labelEn || attr.name, locale: 'en-US' },
          { name: attr.labelPt || attr.name, locale: 'pt-BR' }
        ]
      }));

    // Build customizable credential_metadata.display array
    const metadataDisplay = displays
      .filter((d) => d.name.trim() && d.locale.trim())
      .map((d) => {
        const item = {
          name: d.name.trim(),
          locale: d.locale.trim(),
          background_color: d.background_color || '#1e293b',
          text_color: d.text_color || '#ffffff'
        };
        if (d.logoUrl && d.logoUrl.trim()) {
          item.logo = {
            url: d.logoUrl.trim(),
            ...(d.logoAltText && d.logoAltText.trim() ? { alt_text: d.logoAltText.trim() } : {})
          };
        }
        return item;
      });

    return {
      id: credId,
      vct: vct,
      format: format,
      cryptographic_binding_methods_supported: [bindingMethod],
      credential_signing_alg_values_supported: [signingAlg],
      proof_types_supported: {
        jwt: {
          proof_signing_alg_values_supported: ['ES256', 'ES256K']
        }
      },
      sd_list: sd_list,
      credential_metadata: {
        display: metadataDisplay,
        claims: claims
      }
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const payload = buildPayload();
      const res = await axios.post('/api/credential-supported/create-sd-jwt', payload);
      setResult({ type: 'success', data: res.data });
      if (onCredCreated) onCredCreated(res.data.supported_cred_id);
    } catch (err) {
      setResult({ type: 'error', error: err.response?.data?.error || err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-title">
          <FileCode className="w-5 h-5 text-blue-400" />
          <span>Create Supported SD-JWT Credential</span>
        </div>
        <p className="card-subtitle">
          Define SD-JWT credential properties, customizable <code>credential_metadata.display</code> parameters, attribute names, and localized claims labels.
        </p>

        {result && (
          <div className={`banner ${result.type === 'success' ? 'banner-success' : 'banner-error'}`}>
            {result.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            <div>
              {result.type === 'success' ? (
                <span>
                  Credential Definition <strong>{result.data.supported_cred_id}</strong> created & stored in MongoDB!
                </span>
              ) : (
                <span>
                  Failed to create supported credential: {typeof result.error === 'object' ? JSON.stringify(result.error) : result.error}
                </span>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* General Metadata */}
          <div className="form-grid">
            <div className="form-group">
              <label>Credential Supported ID (id)</label>
              <input
                type="text"
                value={credId}
                onChange={(e) => setCredId(e.target.value)}
                placeholder="e.g. IdentityCardCredential"
                required
              />
            </div>

            <div className="form-group">
              <label>Verifiable Credential Type (vct)</label>
              <input
                type="text"
                value={vct}
                onChange={(e) => setVct(e.target.value)}
                placeholder="e.g. https://example.com/id-card"
                required
              />
            </div>

            <div className="form-group">
              <label>Format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="vc+sd-jwt">vc+sd-jwt</option>
                <option value="jwt_vc_json">jwt_vc_json</option>
              </select>
            </div>

            <div className="form-group">
              <label>Signing Algorithm Supported</label>
              <select value={signingAlg} onChange={(e) => setSigningAlg(e.target.value)}>
                <option value="ES256K">ES256K</option>
                <option value="ES256">ES256</option>
                <option value="Ed25519">Ed25519</option>
              </select>
            </div>
          </div>

          {/* Customizable Credential Display Section (credential_metadata.display) */}
          <div className="attributes-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Palette className="w-4 h-4 text-purple-400" /> Customizable Credential Display Metadata (<code>credential_metadata.display</code>)
                </h4>
                <p className="label-hint">Customize names, locales, card colors, and logo metadata per language.</p>
              </div>

              <button type="button" className="btn btn-secondary btn-sm" onClick={addDisplayEntry}>
                <Plus className="w-4 h-4" /> Add Display Locale
              </button>
            </div>

            {displays.map((disp, index) => (
              <div
                key={index}
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: '14px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}>
                    Display Entry #{index + 1} ({disp.locale || 'Locale'})
                  </span>

                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removeDisplayEntry(index)}
                    disabled={displays.length <= 1}
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                </div>

                <div className="form-grid" style={{ marginBottom: 0 }}>
                  <div className="form-group">
                    <label>Credential Display Name</label>
                    <input
                      type="text"
                      value={disp.name}
                      onChange={(e) => updateDisplayEntry(index, 'name', e.target.value)}
                      placeholder="e.g. National Identity Card"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Locale (RFC 5646)</label>
                    <input
                      type="text"
                      value={disp.locale}
                      onChange={(e) => updateDisplayEntry(index, 'locale', e.target.value)}
                      placeholder="e.g. en-US, pt-BR, es-ES"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Background Color</label>
                    <input
                      type="text"
                      value={disp.background_color}
                      onChange={(e) => updateDisplayEntry(index, 'background_color', e.target.value)}
                      placeholder="#1e293b"
                    />
                  </div>

                  <div className="form-group">
                    <label>Text Color</label>
                    <input
                      type="text"
                      value={disp.text_color}
                      onChange={(e) => updateDisplayEntry(index, 'text_color', e.target.value)}
                      placeholder="#ffffff"
                    />
                  </div>

                  <div className="form-group">
                    <label>Logo URL <span className="label-hint">Optional</span></label>
                    <input
                      type="url"
                      value={disp.logoUrl}
                      onChange={(e) => updateDisplayEntry(index, 'logoUrl', e.target.value)}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>

                  <div className="form-group">
                    <label>Logo Alt Text <span className="label-hint">Optional</span></label>
                    <input
                      type="text"
                      value={disp.logoAltText}
                      onChange={(e) => updateDisplayEntry(index, 'logoAltText', e.target.value)}
                      placeholder="Logo image description"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Attributes and Localized Claims Display Labels */}
          <div className="attributes-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#cbd5e1' }}>
                  🔑 Attributes & Localized Display Labels (<code>claims</code>)
                </h4>
                <p className="label-hint">Set attribute names, selective disclosure flags (SD), and localized labels.</p>
              </div>

              <button type="button" className="btn btn-secondary btn-sm" onClick={addAttribute}>
                <Plus className="w-4 h-4" /> Add Attribute
              </button>
            </div>

            {attributes.map((attr, index) => (
              <div key={index} className="attribute-row">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Attribute Key</label>
                  <input
                    type="text"
                    value={attr.name}
                    onChange={(e) => updateAttribute(index, 'name', e.target.value)}
                    placeholder="e.g. given_name"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Label (en-US)</label>
                  <input
                    type="text"
                    value={attr.labelEn}
                    onChange={(e) => updateAttribute(index, 'labelEn', e.target.value)}
                    placeholder="Given Name"
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Label (pt-BR)</label>
                  <input
                    type="text"
                    value={attr.labelPt}
                    onChange={(e) => updateAttribute(index, 'labelPt', e.target.value)}
                    placeholder="Primeiro Nome"
                  />
                </div>

                <label className="checkbox-group" style={{ marginTop: '18px' }}>
                  <input
                    type="checkbox"
                    checked={attr.isSd}
                    onChange={(e) => updateAttribute(index, 'isSd', e.target.checked)}
                  />
                  <span>SD</span>
                </label>

                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  style={{ marginTop: '18px', padding: '8px' }}
                  onClick={() => removeAttribute(index)}
                  disabled={attributes.length <= 1}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Sparkles className="w-4 h-4" />
              {submitting ? 'Registering Credential...' : 'Register Supported SD-JWT'}
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

        {showJsonPreview && (
          <div style={{ marginTop: '20px' }}>
            <h5 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px' }}>Payload Preview to ACA-Py:</h5>
            <pre>{JSON.stringify(buildPayload(), null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
