import { adminHandler, adminJson, readAdminBody, adminIp, revokeKey } from '@/lib/admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = adminHandler(async (req, { params }) => {
  const { id } = await params;
  const body = await readAdminBody(req);
  const key = await revokeKey(id, body.reason, adminIp(req));
  return adminJson({ ok: true, key });
});
