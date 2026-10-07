'use client';
import { useState } from 'react';
import Link from 'next/link';
import KeyFields from '../KeyFields.js';
import CopyButton from '../CopyButton.js';
import { adminFetch } from '../api.js';

const EMPTY = {
  shop_name: '', owner_name: '', phone: '', city: '', plan: 'standard',
  max_activations: '1', lease_days: '10', expires_at: '', notes: '',
};

function whatsappText(keys, downloadUrl) {
  const lines = keys.length === 1
    ? [`Your CorePOS product key: ${keys[0].key}`]
    : ['Your CorePOS product keys:', ...keys.map((k) => k.key)];
  if (downloadUrl) lines.push(`Download: ${downloadUrl}`);
  return lines.join('\n');
}

function whatsappLink(phone, text) {
  const digits = (phone || '').replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function CreateKeyForm({ downloadUrl }) {
  const [values, setValues] = useState(EMPTY);
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await adminFetch('/api/admin/keys', { method: 'POST', body: { ...values, quantity } });
      setCreated(data.keys);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const msg = whatsappText(created, downloadUrl);
    const allKeys = created.map((k) => k.key).join('\n');
    return (
      <div className="stack">
        <div className="page-head">
          <h1>{created.length === 1 ? 'Key created' : `${created.length} keys created`}</h1>
        </div>
        <div className="card success-card">
          <p className="muted small">For <strong>{created[0].shop_name}</strong></p>
          <ul className="key-list">
            {created.map((k) => (
              <li key={k.id}>
                <span className="big-key mono">{k.key}</span>
                <span className="row">
                  <CopyButton text={k.key} />
                  <Link className="btn ghost small" href={`/admin/keys/${k.id}`}>View</Link>
                </span>
              </li>
            ))}
          </ul>
          {created.length > 1 && <CopyButton text={allKeys} label="Copy all keys" className="btn" />}
        </div>

        <div className="card">
          <h2>WhatsApp message</h2>
          <textarea className="mono" readOnly rows={msg.split('\n').length + 1} value={msg} onFocus={(e) => e.target.select()} />
          <div className="row wrap">
            <CopyButton text={msg} label="Copy message" className="btn primary" />
            <a className="btn" href={whatsappLink(created[0].phone, msg)} target="_blank" rel="noreferrer">Open in WhatsApp</a>
          </div>
          {!downloadUrl && <p className="muted small">Tip: set the DOWNLOAD_URL environment variable to include a download link.</p>}
        </div>

        <div className="row wrap">
          <button className="btn" onClick={() => { setCreated(null); setValues(EMPTY); setQuantity('1'); }}>Create another</button>
          <Link className="btn ghost" href="/admin">Back to keys</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="page-head"><h1>Create product key</h1></div>
      <div className="card">
        <KeyFields values={values} onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))} />
        <div className="grid">
          <label className="field">
            <span>Quantity (keys with these details)</span>
            <input type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="row wrap">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Creating...' : Number(quantity) > 1 ? `Create ${quantity} keys` : 'Create key'}
        </button>
        <Link className="btn ghost" href="/admin">Cancel</Link>
      </div>
    </form>
  );
}
