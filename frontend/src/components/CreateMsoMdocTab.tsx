import React, { useState } from 'react';
import { FileCheck, Plus, Trash2, CheckCircle, ShieldAlert, Code, Sparkles, Palette } from 'lucide-react';
import axios from 'axios';

const KNOWN_NAMESPACE_ATTRIBUTES: Record<string, string[]> = {
  'org.iso.18013.5.1': [
    'family_name',
    'given_name',
    'birth_date',
    'issue_date',
    'expiry_date',
    'issuing_country',
    'issuing_authority',
    'document_number',
    'portrait',
    'driving_privileges',
    'unlisted_domestic_driving_privileges',
    'administrative_number',
    'sex',
    'height',
    'weight',
    'eye_colour',
    'hair_colour',
    'place_of_birth',
    'resident_address',
    'portrait_capture_date',
    'age_in_years',
    'age_birth_year',
    'un_distinguishing_sign',
    'age_over_18',
    'age_over_21',
    'age_over_65',
    'issuing_jurisdiction',
    'nationality',
    'resident_city',
    'resident_state',
    'resident_postal_code',
    'resident_country',
    'biometric_template_signature_sign',
    'biometric_template_facial',
    'biometric_template_fingerprint',
    'biometric_template_iris'
  ],
  'org.iso.18013.5.1.aamva': [
    'domestic_driving_privileges',
    'organ_donor',
    'veteran',
    'race_ethnicity',
    'compliance_type',
    'audit_information',
    'hazmat_endorsement_expiration_date',
    'weight_range',
    'race',
    'ethnicity',
    'resident_county',
    'family_name_truncation',
    'given_name_truncation',
    'middle_name_truncation'
  ],
  'eu.europa.ec.eudi.pid.1': [
    'family_name',
    'given_name',
    'birth_date',
    'age_over_18',
    'age_in_years',
    'age_birth_year',
    'family_name_birth',
    'given_name_birth',
    'place_of_birth',
    'resident_address',
    'resident_country',
    'resident_state',
    'resident_city',
    'resident_postal_code',
    'resident_street',
    'resident_house_number',
    'gender',
    'nationality',
    'issuing_jurisdiction',
    'issuing_authority',
    'issuing_country',
    'date_of_issuance',
    'date_of_expiry',
    'document_number',
    'administrative_number'
  ]
};

interface CreateMsoMdocTabProps {
  onCredCreated?: (credId: string) => void;
}

export default function CreateMsoMdocTab({ onCredCreated }: CreateMsoMdocTabProps) {
  const [credId, setCredId] = useState('org.iso.18013.5.1.mDL');
  const [doctype, setDoctype] = useState('org.iso.18013.5.1.mDL');
  const [defaultNamespace, setDefaultNamespace] = useState('org.iso.18013.5.1');
  const [signingAlg, setSigningAlg] = useState('-7');
  const [bindingMethod, setBindingMethod] = useState('cose_key');
  const [proofSigningAlgs, setProofSigningAlgs] = useState('ES256');
  const [signingKeyId, setSigningKeyId] = useState('');

  // Customizable credential_metadata.display entries
  const [displays, setDisplays] = useState([
    {
      name: 'Carteira Digital de Habilitação (mDL)',
      locale: 'pt-BR',
      background_color: '#12107c',
      text_color: '#ffffff',
      logoUri: '',
      logoAltText: '',
      backgroundImageUri: '',
      backgroundImageAltText: ''
    },
    {
      name: 'Mobile Driving License (mDL)',
      locale: 'en-US',
      background_color: '#12107c',
      text_color: '#ffffff',
      logoUri: '',
      logoAltText: '',
      backgroundImageUri: '',
      backgroundImageAltText: ''
    }
  ]);

  // Dynamic attributes list for mso-mdoc with namespace support
  const [attributes, setAttributes] = useState([
    { name: 'given_name', namespace: 'org.iso.18013.5.1', labelEn: 'Given Name', labelPt: 'Primeiro Nome' },
    { name: 'family_name', namespace: 'org.iso.18013.5.1', labelEn: 'Surname', labelPt: 'Sobrenome' },
    { name: 'birth_date', namespace: 'org.iso.18013.5.1', labelEn: 'Date of Birth', labelPt: 'Data de Nascimento' },
    { name: 'issue_date', namespace: 'org.iso.18013.5.1', labelEn: 'Issue Date', labelPt: 'Data de Emissão' },
    { name: 'expiry_date', namespace: 'org.iso.18013.5.1', labelEn: 'Expiry Date', labelPt: 'Data de Validade' },
    { name: 'document_number', namespace: 'org.iso.18013.5.1', labelEn: 'Document Number', labelPt: 'Número do Documento' },
    { name: 'issuing_country', namespace: 'org.iso.18013.5.1', labelEn: 'issuing_country', labelPt: 'issuing_country' },
    { name: 'issuing_authority', namespace: 'org.iso.18013.5.1', labelEn: 'issuing_authority', labelPt: 'issuing_authority' },
    { name: 'portrait', namespace: 'org.iso.18013.5.1', labelEn: 'portrait', labelPt: 'portrait' },
    { name: 'un_distinguishing_sign', namespace: 'org.iso.18013.5.1', labelEn: 'un_distinguishing_sign', labelPt: 'un_distinguishing_sign' }
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
      { name: `attr_${attributes.length + 1}`, namespace: defaultNamespace, labelEn: '', labelPt: '' }
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
    const claims = attributes
      .filter((attr) => attr.name.trim())
      .map((attr) => ({
        path: [attr.namespace?.trim() || defaultNamespace.trim() || 'org.iso.18013.5.1', attr.name.trim()],
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
      doctype: doctype,
      format: 'mso_mdoc',
      cryptographic_binding_methods_supported: [bindingMethod],
      credential_signing_alg_values_supported: [signingAlg],
      proof_types_supported: {
        jwt: {
          proof_signing_alg_values_supported: parsedProofAlgs.length > 0 ? parsedProofAlgs : ['ES256']
        }
      },
      ...(signingKeyId.trim() ? { signing_key_id: signingKeyId.trim() } : {}),
      credential_metadata: {
        display: metadataDisplay,
        claims: claims
      }
    };
  };

  const validateAttributes = (): string | null => {
    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      const name = attr.name.trim();
      const ns = (attr.namespace?.trim() || defaultNamespace.trim() || 'org.iso.18013.5.1');

      if (!name) {
        return `Attribute #${i + 1} has an empty key name.`;
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return `Attribute #${i + 1} ("${name}") has an invalid key format. Attribute keys can only contain letters, numbers, underscores, and hyphens.`;
      }

      const knownList = KNOWN_NAMESPACE_ATTRIBUTES[ns];
      if (knownList && !knownList.includes(name)) {
        return `Invalid attribute key "${name}" for namespace "${ns}". Valid standard attributes for namespace "${ns}" are: ${knownList.join(', ')}`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    const validationErr = validateAttributes();
    if (validationErr) {
      setResult({ type: 'error', error: validationErr });
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      const res = await axios.post('/api/credential-supported/create-mso-mdoc', payload);
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
          <FileCheck className="w-5 h-5 text-blue-400" />
          <span>Create Supported mso-mdoc Credential</span>
        </div>
        <p className="card-subtitle">
          Define ISO 18013-5 mso-mdoc credential properties (doctype, namespace), signing algorithms, customizable <code>credential_metadata.display</code> parameters, and namespace-keyed claims.
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
                placeholder="e.g. org.iso.18013.5.1.mDL"
                required
              />
            </div>

            <div className="form-group">
              <label>Document Type (doctype)</label>
              <input
                type="text"
                value={doctype}
                onChange={(e) => setDoctype(e.target.value)}
                placeholder="e.g. org.iso.18013.5.1.mDL"
                required
              />
            </div>

            <div className="form-group">
              <label>Default Namespace</label>
              <input
                type="text"
                value={defaultNamespace}
                onChange={(e) => setDefaultNamespace(e.target.value)}
                placeholder="e.g. org.iso.18013.5.1"
                required
              />
            </div>

            <div className="form-group">
              <label>Signing Algorithm Supported (credential_signing_alg_values_supported)</label>
              <input
                type="text"
                value={signingAlg}
                onChange={(e) => setSigningAlg(e.target.value)}
                placeholder="-7 (ES256), -8 (EdDSA)..."
                list="mdoc-signing-alg-options"
                required
              />
              <datalist id="mdoc-signing-alg-options">
                <option value="-7" />
                <option value="-8" />
                <option value="-35" />
                <option value="ES256" />
              </datalist>
            </div>

            <div className="form-group">
              <label>Cryptographic Binding Method (cryptographic_binding_methods_supported)</label>
              <input
                type="text"
                value={bindingMethod}
                onChange={(e) => setBindingMethod(e.target.value)}
                placeholder="cose_key, mdoc, did..."
                list="mdoc-binding-options"
                required
              />
              <datalist id="mdoc-binding-options">
                <option value="cose_key" />
                <option value="mdoc" />
                <option value="did" />
              </datalist>
            </div>

            <div className="form-group">
              <label>Proof Signing Algorithms (proof_types_supported.jwt)</label>
              <input
                type="text"
                value={proofSigningAlgs}
                onChange={(e) => setProofSigningAlgs(e.target.value)}
                placeholder="ES256 (comma separated)"
                required
              />
            </div>

            <div className="form-group">
              <label>mDoc Signing Key Record ID <span className="label-hint">Optional</span></label>
              <input
                type="text"
                value={signingKeyId}
                onChange={(e) => setSigningKeyId(e.target.value)}
                placeholder="e.g. signing-key-id-123"
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
                      placeholder="e.g. Mobile Driving License"
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
                  🔑 Namespace Claims &amp; Localized Display Labels (<code>claims</code>)
                </h4>
                <p className="label-hint">Set attribute keys, namespaces, and localized labels.</p>
              </div>

              <button type="button" className="btn btn-secondary btn-sm" onClick={addAttribute}>
                <Plus className="w-4 h-4" /> Add Attribute
              </button>
            </div>

            {attributes.map((attr, index) => (
              <div key={index} className="attribute-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Namespace</label>
                  <input
                    type="text"
                    value={attr.namespace}
                    onChange={(e) => updateAttribute(index, 'namespace', e.target.value)}
                    placeholder="org.iso.18013.5.1"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Attribute Key</label>
                  <input
                    type="text"
                    value={attr.name}
                    onChange={(e) => updateAttribute(index, 'name', e.target.value)}
                    placeholder="e.g. given_name"
                    list="mdoc-valid-attr-options"
                    required
                  />
                  <datalist id="mdoc-valid-attr-options">
                    {(KNOWN_NAMESPACE_ATTRIBUTES[attr.namespace?.trim() || defaultNamespace.trim() || 'org.iso.18013.5.1'] || KNOWN_NAMESPACE_ATTRIBUTES['org.iso.18013.5.1']).map((key) => (
                      <option key={key} value={key} />
                    ))}
                  </datalist>
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

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Label (en-US)</label>
                  <input
                    type="text"
                    value={attr.labelEn}
                    onChange={(e) => updateAttribute(index, 'labelEn', e.target.value)}
                    placeholder="Given Name"
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
              {submitting ? 'Registering Credential...' : 'Register Supported mso-mdoc'}
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
