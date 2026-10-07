'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed');
      window.location.href = '/admin';
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete="current-password" autoFocus required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <div className="alert error">{error}</div>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
    </form>
  );
}
