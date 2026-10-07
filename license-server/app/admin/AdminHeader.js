import Link from 'next/link';
import LogoutButton from './LogoutButton.js';

export default function AdminHeader() {
  return (
    <header className="topbar">
      <Link href="/admin" className="brand">CorePOS <span>Licenses</span></Link>
      <nav>
        <Link href="/admin" className="btn ghost small">Keys</Link>
        <Link href="/admin/new" className="btn primary small">+ Create key</Link>
        <LogoutButton />
      </nav>
    </header>
  );
}
