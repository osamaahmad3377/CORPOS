'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import KeyFields from '../../KeyFields.js';
import CopyButton from '../../CopyButton.js';
import StatusBadge from '../../StatusBadge.js';
import { adminFetch } from '../../api.js';

const EDITABLE = ['shop_name', 'owner_name', 'phone', 'city', 'plan', 'max_activations', 'lease_days', 'expires_at', 'notes'];

export default function KeyDetail({ licenseKey: k, activations, audit, timeZone, downloadUrl }) {
  const router = useRouter();
  const initial = Object.fromEntries(EDITABLE.map((f) => [f, k[f]]));
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showRevoke, setShowRevoke] = useState(false);
  const [reason, setReason] = useState('');

  // After a save + router.refresh(), sync the form with what the server stored.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setValues(initial), [k.updated_at]);

  const dirty = EDITABLE.some((f) => String(values[f] ?? '') !== String(initial[f] ?? ''));
  const activeCount = activations.filter((a) => a.active).length;

  async function run(label, fn, successMsg) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(successMsg);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const base = `/api/admin/keys/${k.id}`;

  function save(e) {
    e.preventDefault();
    run('save', () => adminFetch(base, { method: 'PATCH', body: values }), 'Changes saved.');
  }

  function revoke(e) {
    e.preventDefault();
    if (!window.confirm(`Revoke ${k.key}?\n\nThe POS will lock at its next online check (or when its offline lease ends).`)) return;
    run('revoke', async () => {
      await adminFetch(`${base}/revoke`, { method: 'POST', body: { reason } });
      setShowRevoke(false);
      setReason('');
    }, 'Key revoked.');
  }

  function reinstate() {
    if (!window.confirm(`Reinstate ${k.key}?`)) return;
    run('reinstate', () => adminFetch(`${base}/reinstate`, { method: 'POST', body: {} }), 'Key reinstated.');
  }

  function resetAll() {
    if (!window.confirm(`Deactivate ALL ${activeCount} computer(s) for this key?\n\nEach computer will need to activate again.`)) return;
    run('reset', () => adminFetch(`${base}/reset`, { method: 'POST', body: {} }), 'All activations were reset.');
  }

  function deactivateOne(a) {
    if (!window.confirm(`Deactivate ${a.machine_name || a.machine_id}?\n\nThis frees the seat so the key can be used on another computer.`)) return;
    run(`deact-${a.id}`, () => adminFetch(`${base}/activations/${a.id}/deactivate`, { method: 'POST', body: {} }), 'Computer deactivated.');
  }

  const waText = `Your CorePOS product key: ${k.key}` + (downloadUrl ? `\nDownload: ${downloadUrl}` : '');

  return (
    <div className="stack">
      <div><Link href="/admin" className="muted small">&larr; All keys</Link></div>

      <div className="card key-hero">
        <div className="key-hero-main">
          <span className="big-key mono">{k.key}</span>
          <StatusBadge status={k.status} />
        </div>
        <div className="row wrap">
          <CopyButton text={k.key} label="Copy key" />
          <CopyButton text={waText} label="Copy WhatsApp message" />
        </div>
        <dl className="facts">
          <div><dt>Shop</dt><dd>{k.shop_name}</dd></div>
          <div><dt>Activations</dt><dd>{activeCount} / {k.max_activations}</dd></div>
          <div><dt>Expires</dt><dd>{k.expires_display}</dd></div>
          <div><dt>Created</dt><dd>{k.created_at}</dd></div>
          <div><dt>Updated</dt><dd>{k.updated_at}</dd></div>
          {k.rawStatus === 'revoked' && (
            <div><dt>Revoked</dt><dd>{k.revoked_at}{k.revoked_reason ? ` — ${k.revoked_reason}` : ''}</dd></div>
          )}
        </dl>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <div className="card">
        <h2>Actions</h2>
        <div className="row wrap">
          {k.rawStatus === 'revoked' ? (
            <button className="btn primary" onClick={reinstate} disabled={!!busy}>
              {busy === 'reinstate' ? 'Reinstating...' : 'Reinstate key'}
            </button>
          ) : (
            <button className="btn danger" onClick={() => setShowRevoke((s) => !s)} disabled={!!busy}>Revoke key</button>
          )}
          <button className="btn" onClick={resetAll} disabled={!!busy || activeCount === 0}>
            {busy === 'reset' ? 'Resetting...' : 'Reset all activations'}
          </button>
        </div>
        {showRevoke && k.rawStatus !== 'revoked' && (
          <form onSubmit={revoke} className="stack revoke-box">
            <label className="field">
              <span>Reason (shown in the audit log)</span>
              <input value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Payment not received" autoFocus />
            </label>
            <div className="row wrap">
              <button className="btn danger" disabled={!!busy}>{busy === 'revoke' ? 'Revoking...' : 'Confirm revoke'}</button>
              <button type="button" className="btn ghost" onClick={() => setShowRevoke(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Computers ({activeCount} active / {k.max_activations} allowed)</h2>
        {activations.length === 0 ? (
          <p className="muted">Not activated on any computer yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>Machine</th><th>Version</th><th>First activated</th><th>Last seen</th><th>IP</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {activations.map((a) => (
                  <tr key={a.id} className={a.active ? '' : 'dim'}>
                    <td data-label="Machine">
                      <div>
                        <strong>{a.machine_name || 'Unnamed'}</strong>
                        <div className="mono small muted break">{a.machine_id}</div>
                      </div>
                    </td>
                    <td data-label="Version">{a.app_version || '—'}</td>
                    <td data-label="First activated">{a.first_activated_at}</td>
                    <td data-label="Last seen">{a.last_seen_at}</td>
                    <td data-label="IP" className="mono small">{a.last_ip || '—'}</td>
                    <td data-label="Status">
                      {a.active ? <span className="badge active">Active</span> : <span className="badge muted" title={a.deactivated_at}>Deactivated</span>}
                    </td>
                    <td className="actions">
                      {a.active && (
                        <button className="btn small" onClick={() => deactivateOne(a)} disabled={!!busy}>
                          {busy === `deact-${a.id}` ? '...' : 'Deactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form className="card" onSubmit={save}>
        <h2>Details</h2>
        <KeyFields values={values} onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))} />
        <p className="muted small">Dates use the {timeZone} time zone; a key expires at the end of the chosen day.</p>
        <div className="row wrap">
          <button className="btn primary" disabled={!dirty || !!busy}>{busy === 'save' ? 'Saving...' : 'Save changes'}</button>
          {dirty && <button type="button" className="btn ghost" onClick={() => setValues(initial)}>Discard</button>}
        </div>
      </form>

      <div className="card">
        <h2>Audit log</h2>
        {audit.length === 0 ? (
          <p className="muted">No events yet.</p>
        ) : (
          <ul className="audit">
            {audit.map((e) => (
              <li key={e.id}>
                <div className="row wrap">
                  <span className={`badge ev-${e.event}`}>{e.event}</span>
                  <span className="muted small">{e.created_at}</span>
                  {e.ip && <span className="muted small mono">{e.ip}</span>}
                </div>
                {e.detail && <code className="detail">{e.detail}</code>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
