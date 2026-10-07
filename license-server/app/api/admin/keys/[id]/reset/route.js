import { adminHandler, adminJson, adminIp, resetActivations } from '@/lib/admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = adminHandler(async (req, { params }) => {
  const { id } = await params;
  const count = await resetActivations(id, adminIp(req));
  return adminJson({ ok: true, deactivated: count });
});
