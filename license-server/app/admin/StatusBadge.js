const LABELS = { active: 'Active', revoked: 'Revoked', expired: 'Expired' };

export default function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{LABELS[status] || status}</span>;
}
