import { adminHandler, adminJson, adminIp, reinstateKey } from '@/lib/admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = adminHandler(async (req, { params }) => {
  const { id } = await params;
  const key = await reinstateKey(id, adminIp(req));
  return adminJson({ ok: true, key });
});
