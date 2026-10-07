import Link from 'next/link';
import { requireAdminPage, listKeys } from '@/lib/admin.js';
import { fmtDate, fmtDateTime, effectiveStatus } from '@/lib/format.js';
import AdminHeader from './AdminHeader.js';
import StatusBadge from './StatusBadge.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Keys - CorePOS Licenses' };

export default async function Dashboard({ searchParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = typeof sp?.q === 'string' ? sp.q : '';
  const keys = await listKeys(q);

  const counts = { active: 0, revoked: 0, expired: 0 };
  for (const k of keys) counts[effectiveStatus(k)]++;

  return (
    <>
      <AdminHeader />
      <main className="container">
        <div className="page-head">
          <h1>Product keys</h1>
          <Link href="/admin/new" className="btn primary">+ Create key</Link>
        </div>

        <form className="search" method="get" action="/admin">
          <input type="search" name="q" defaultValue={q} placeholder="Search key, shop, owner, phone or city" />
          <button className="btn">Search</button>
          {q && <Link href="/admin" className="btn ghost">Clear</Link>}
        </form>

        <p className="muted small">
          {keys.length} key{keys.length === 1 ? '' : 's'}{q ? ` matching "${q}"` : ''}
          {' '}· {counts.active} active · {counts.expired} expired · {counts.revoked} revoked
          {keys.length >= 500 ? ' (showing newest 500)' : ''}
        </p>

        {keys.length === 0 ? (
          <div className="card empty">
            {q ? 'No keys match your search.' : 'No keys yet.'}{' '}
            <Link href="/admin/new">Create your first key</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Shop</th>
                  <th>Status</th>
                  <th>Activations</th>
                  <th>Last seen</th>
                  <th>Expiry</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td data-label="Key"><Link href={`/admin/keys/${k.id}`} className="mono nowrap">{k.key}</Link></td>
                    <td data-label="Shop">
                      <div>
                        <strong>{k.shop_name}</strong>
                        <div className="muted small">{[k.owner_name, k.city, k.phone].filter(Boolean).join(' · ')}</div>
                      </div>
                    </td>
                    <td data-label="Status"><StatusBadge status={effectiveStatus(k)} /></td>
                    <td data-label="Activations">{k.used} / {k.max_activations}</td>
                    <td data-label="Last seen">{k.last_seen ? fmtDateTime(k.last_seen) : <span className="muted">Never</span>}</td>
                    <td data-label="Expiry">{k.expires_at ? fmtDate(k.expires_at) : <span className="muted">Lifetime</span>}</td>
                    <td className="actions"><Link href={`/admin/keys/${k.id}`} className="btn small">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
