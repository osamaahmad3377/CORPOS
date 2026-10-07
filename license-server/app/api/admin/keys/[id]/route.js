import { adminHandler, adminJson, readAdminBody, adminIp, getKeyDetail, updateKey } from '@/lib/admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = adminHandler(async (req, { params }) => {
  const { id } = await params;
  const detail = await getKeyDetail(id);
  if (!detail) return adminJson({ ok: false, error: 'Key not found.' }, 404);
  return adminJson({ ok: true, ...detail });
});

export const PATCH = adminHandler(async (req, { params }) => {
  const { id } = await params;
  const key = await updateKey(id, await readAdminBody(req), adminIp(req));
  return adminJson({ ok: true, key });
});
