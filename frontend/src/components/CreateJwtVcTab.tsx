import React, { useState } from 'react';
import { FileText, Plus, Trash2, CheckCircle, ShieldAlert, Code, Sparkles, Palette } from 'lucide-react';
import axios from 'axios';

interface CreateJwtVcTabProps {
  onCredCreated?: (credId: string) => void;
}

export default function CreateJwtVcTab({ onCredCreated }: CreateJwtVcTabProps) {
  const [credId, setCredId] = useState('UniversityDegreeCredential');
  const [contexts, setContexts] = useState(
    'https://www.w3.org/2018/credentials/v1, https://www.w3.org/2018/credentials/examples/v1'
  );
  const [types, setTypes] = useState('VerifiableCredential, UniversityDegreeCredential');
  const [signingAlg, setSigningAlg] = useState('ES256K');
  const [bindingMethod, setBindingMethod] = useState('did');
  const [proofSigningAlgs, setProofSigningAlgs] = useState('ES256, ES256K');

  // Customizable credential_metadata.display entries
  const [displays, setDisplays] = useState([
    {
      name: 'University Degree Credential',
      locale: 'en-US',
      background_color: '#12107c',
      text_color: '#ffffff',
      logoUri: '',
      logoAltText: '',
      backgroundImageUri: '',
      backgroundImageAltText: ''
    },
    {
      name: 'Diploma Universitário',
      locale: 'pt-BR',
      background_color: '#12107c',
      text_color: '#ffffff',
      logoUri: '',
      logoAltText: '',
      backgroundImageUri: '',
      backgroundImageAltText: ''
    }
  ]);

  // Dynamic attributes list
  const [attributes, setAttributes] = useState([
    { name: 'given_name', labelEn: 'Given Name', labelPt: 'Primeiro Nome' },
    { name: 'family_name', labelEn: 'Surname / Family Name', labelPt: 'Sobrenome' },
    { name: 'degree', labelEn: 'Degree Name', labelPt: 'Nome do Diploma' },
    { name: 'gpa', labelEn: 'Grade Point Average', labelPt: 'Média Global' }
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; data?: any; error?: any } | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  // --- Display Entries Handlers ---
  const addDisplayEntry = () => {
    setDisplays([
      ...displays,
      {
        name: '',
        locale: 'es-ES',
        background_color: '#12107c',
        text_color: '#ffffff',
        logoUri: '',
        logoAltText: '',
        backgroundImageUri: '',
        backgroundImageAltText: ''
      }
    ]);
  };

  const removeDisplayEntry = (index: number) => {
    setDisplays(displays.filter((_, i) => i !== index));
  };

  const updateDisplayEntry = (index: number, field: string, value: string) => {
    const updated = [...displays];
    (updated[index] as any)[field] = value;
    setDisplays(updated);
  };

  // --- Attribute Handlers ---
  const addAttribute = () => {
    setAttributes([
      ...attributes,
      { name: `attr_${attributes.length + 1}`, labelEn: '', labelPt: '' }
    ]);
  };

  const removeAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const updateAttribute = (index: number, field: string, value: string) => {
    const updated = [...attributes];
    (updated[index] as any)[field] = value;
    setAttributes(updated);
  };

  const buildPayload = () => {
    const contextList = contexts.split(',').map((s) => s.trim()).filter(Boolean);
    const typeList = types.split(',').map((s) => s.trim()).filter(Boolean);

    const claims = attributes
      .filter((attr) => attr.name.trim())
      .map((attr) => ({
        path: [attr.name.trim()],
        display: [
          { name: attr.labelEn || attr.name, locale: 'en-US' },
          { name: attr.labelPt || attr.name, locale: 'pt-BR' }
        ]
      }));

    const metadataDisplay = displays
      .filter((d) => d.name.trim() && d.locale.trim())
      .map((d) => {
        const item: any = {
          name: d.name.trim(),
          locale: d.locale.trim(),
          background_color: d.background_color || '#12107c',
          text_color: d.text_color || '#ffffff'
        };
        if (d.logoUri && d.logoUri.trim()) {
          item.logo = {
            uri: d.logoUri.trim(),
            ...(d.logoAltText && d.logoAltText.trim() ? { alt_text: d.logoAltText.trim() } : {})
          };
        }
        if (d.backgroundImageUri && d.backgroundImageUri.trim()) {
          item.background_image = {
            uri: d.backgroundImageUri.trim(),
            ...(d.backgroundImageAltText && d.backgroundImageAltText.trim() ? { alt_text: d.backgroundImageAltText.trim() } : {})
          };
        }
        return item;
      });

    const parsedProofAlgs = proofSigningAlgs
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    return {
      id: credId,
      format: 'jwt_vc_json',
      credential_definition: {
        '@context': contextList.length > 0 ? contextList : ['https://www.w3.org/2018/credentials/v1'],
        type: typeList.length > 0 ? typeList : ['VerifiableCredential']
      },
      cryptographic_binding_methods_supported: [bindingMethod],
      credential_signing_alg_values_supported: [signingAlg],
      proof_types_supported: {
        jwt: {
          proof_signing_alg_values_supported: parsedProofAlgs.length > 0 ? parsedProofAlgs : ['ES256', 'ES256K']
        }
      },
      credential_metadata: {
        display: metadataDisplay,
        claims: claims
      }
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const payload = buildPayload();
      const res = await axios.post('/api/credential-supported/create-jwt', payload);
      setResult({ type: 'success', data: res.data });
      if (onCredCreated) onCredCreated(res.data.supported_cred_id);
    } catch (err: any) {
      setResult({ type: 'error', error: err.response?.data?.error || err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-title">
          <FileText className="w-5 h-5 text-blue-400" />
          <span>Create Supported JWT-VC Credential</span>
        </div>
        <p className="card-subtitle">
          Define W3C JWT-VC credential properties (context, credential type), customizable <code>credential_metadata.display</code> parameters, attribute names, and localized claims labels.
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
                placeholder="e.g. UniversityDegreeCredential"
                required
              />
            </div>

            <div className="form-group">
              <label>@context (comma-separated URIs)</label>
              <input
                type="text"
                value={contexts}
                onChange={(e) => setContexts(e.target.value)}
                placeholder="https://www.w3.org/2018/credentials/v1..."
                required
              />
            </div>

            <div className="form-group">
              <label>Credential Type (comma-separated)</label>
              <input
                type="text"
                value={types}
                onChange={(e) => setTypes(e.target.value)}
                placeholder="VerifiableCredential, UniversityDegreeCredential..."
                required
              />
            </div>

            <div className="form-group">
              <label>Signing Algorithm Supported (credential_signing_alg_values_supported)</label>
              <input
                type="text"
                value={signingAlg}
                onChange={(e) => setSigningAlg(e.target.value)}
                placeholder="ES256K, ES256, EdDSA..."
                list="jwt-signing-alg-options"
                required
              />
              <datalist id="jwt-signing-alg-options">
                <option value="ES256K" />
                <option value="ES256" />
                <option value="EdDSA" />
                <option value="ES384" />
                <option value="ES512" />
              </datalist>
            </div>

            <div className="form-group">
              <label>Cryptographic Binding Method (cryptographic_binding_methods_supported)</label>
              <input
                type="text"
                value={bindingMethod}
                onChange={(e) => setBindingMethod(e.target.value)}
                placeholder="did, jwk..."
                list="jwt-binding-options"
                required
              />
              <datalist id="jwt-binding-options">
                <option value="did" />
                <option value="jwk" />
                <option value="did:key" />
              </datalist>
            </div>

            <div className="form-group">
              <label>Proof Signing Algorithms (proof_types_supported.jwt)</label>
              <input
                type="text"
                value={proofSigningAlgs}
                onChange={(e) => setProofSigningAlgs(e.target.value)}
                placeholder="ES256, ES256K (comma separated)"
                required
              />
            </div>
          </div>

          {/* Customizable Credential Display Section */}
          <div className="attributes-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Palette className="w-4 h-4" /> Customizable Credential Display Metadata (<code>credential_metadata.display</code>)
                </h4>
                <p className="label-hint">Customize names, locales, card colors, and logo metadata per language.</p>
              </div>

              <button type="button" className="btn btn-secondary btn-sm" onClick={addDisplayEntry}>
                <Plus className="w-4 h-4" /> Add Display Locale
              </button>
            </div>

            {displays.map((disp, index) => (
              <div key={index} className="sub-card" style={{ marginBottom: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
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
                      placeholder="e.g. University Degree"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Locale (RFC 5646)</label>
                    <input
                      type="text"
                      value={disp.locale}
                      onChange={(e) => updateDisplayEntry(index, 'locale', e.target.value)}
                      placeholder="e.g. en-US, pt-BR"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Background Color</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={disp.background_color || '#12107c'}
                        onChange={(e) => updateDisplayEntry(index, 'background_color', e.target.value)}
                        style={{ width: '42px', height: '38px', padding: '2px', cursor: 'pointer', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)' }}
                      />
                      <input
                        type="text"
                        value={disp.background_color}
                        onChange={(e) => updateDisplayEntry(index, 'background_color', e.target.value)}
                        placeholder="#12107c"
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Text Color</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="color"
                        value={disp.text_color || '#ffffff'}
                        onChange={(e) => updateDisplayEntry(index, 'text_color', e.target.value)}
                        style={{ width: '42px', height: '38px', padding: '2px', cursor: 'pointer', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.2)' }}
                      />
                      <input
                        type="text"
                        value={disp.text_color}
                        onChange={(e) => updateDisplayEntry(index, 'text_color', e.target.value)}
                        placeholder="#ffffff"
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Logo URI <span className="label-hint">Optional</span></label>
                    <input
                      type="url"
                      value={disp.logoUri}
                      onChange={(e) => updateDisplayEntry(index, 'logoUri', e.target.value)}
                      placeholder="https://example.com/logo.png"
                    />
                  </div>

                  <div className="form-group">
                    <label>Logo Alt Text <span className="label-hint">Optional</span></label>
                    <input
                      type="text"
                      value={disp.logoAltText}
                      onChange={(e) => updateDisplayEntry(index, 'logoAltText', e.target.value)}
                      placeholder="Logo description"
                    />
                  </div>

                  <div className="form-group">
                    <label>Background Image URI <span className="label-hint">Optional</span></label>
                    <input
                      type="url"
                      value={disp.backgroundImageUri}
                      onChange={(e) => updateDisplayEntry(index, 'backgroundImageUri', e.target.value)}
                      placeholder="https://example.com/background.png"
                    />
                  </div>

                  <div className="form-group">
                    <label>Background Image Alt Text <span className="label-hint">Optional</span></label>
                    <input
                      type="text"
                      value={disp.backgroundImageAltText}
                      onChange={(e) => updateDisplayEntry(index, 'backgroundImageAltText', e.target.value)}
                      placeholder="Background image description"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Attributes and Localized Claims Labels */}
          <div className="attributes-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  🔑 Attributes &amp; Localized Display Labels (<code>claims</code>)
                </h4>
                <p className="label-hint">Set attribute names and localized labels.</p>
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
              {submitting ? 'Registering Credential...' : 'Register Supported JWT-VC'}
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
            <h5 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Payload Preview to ACA-Py:</h5>
            <pre>{JSON.stringify(buildPayload(), null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
