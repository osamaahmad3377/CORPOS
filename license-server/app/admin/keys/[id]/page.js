import { notFound } from 'next/navigation';
import { requireAdminPage, getKeyDetail, displayTimeZone } from '@/lib/admin.js';
import { fmtDate, fmtDateTime, dateInputValue, effectiveStatus } from '@/lib/format.js';
import AdminHeader from '../../AdminHeader.js';
import KeyDetail from './KeyDetail.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Key - CorePOS Licenses' };

export default async function KeyPage({ params }) {
  await requireAdminPage();
  const { id } = await params;
  const detail = await getKeyDetail(id);
  if (!detail) notFound();
  const { key: k, activations, audit } = detail;

  // Pass plain, pre-formatted data to the client component.
  const key = {
    id: k.id,
    key: k.key,
    status: effectiveStatus(k),
    rawStatus: k.status,
    shop_name: k.shop_name || '',
    owner_name: k.owner_name || '',
    phone: k.phone || '',
    city: k.city || '',
    notes: k.notes || '',
    plan: k.plan || 'standard',
    max_activations: String(k.max_activations),
    lease_days: String(k.lease_days),
    expires_at: dateInputValue(k.expires_at),
    expires_display: k.expires_at ? fmtDateTime(k.expires_at) : 'Lifetime',
    revoked_at: fmtDateTime(k.revoked_at),
    revoked_reason: k.revoked_reason || '',
    created_at: fmtDateTime(k.created_at),
    updated_at: fmtDateTime(k.updated_at),
  };
  const acts = activations.map((a) => ({
    id: a.id,
    machine_id: a.machine_id,
    machine_name: a.machine_name || '',
    app_version: a.app_version || '',
    first_activated_at: fmtDateTime(a.first_activated_at),
    last_seen_at: fmtDateTime(a.last_seen_at),
    last_ip: a.last_ip || '',
    active: !a.deactivated_at,
    deactivated_at: fmtDateTime(a.deactivated_at),
  }));
  const log = audit.map((e) => ({
    id: e.id,
    event: e.event,
    detail: e.detail == null ? '' : typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail),
    ip: e.ip || '',
    created_at: fmtDateTime(e.created_at),
  }));

  return (
    <>
      <AdminHeader />
      <main className="container">
        <KeyDetail
          licenseKey={key}
          activations={acts}
          audit={log}
          timeZone={displayTimeZone()}
          downloadUrl={process.env.DOWNLOAD_URL || ''}
          expiresShort={k.expires_at ? fmtDate(k.expires_at) : ''}
        />
      </main>
    </>
  );
}
