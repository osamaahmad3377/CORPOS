import { adminHandler, adminJson, adminIp, deactivateActivation } from '@/lib/admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = adminHandler(async (req, { params }) => {
  const { id, activationId } = await params;
  await deactivateActivation(id, activationId, adminIp(req));
  return adminJson({ ok: true });
});
