'use client';

export default function LogoutButton() {
  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }
  return (
    <button type="button" className="btn ghost small" onClick={logout}>Log out</button>
  );
}
