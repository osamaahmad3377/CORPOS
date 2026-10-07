import { adminHandler, adminJson, readAdminBody, adminIp, listKeys, createKeys } from '@/lib/admin.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = adminHandler(async (req) => {
  const keys = await listKeys(req.nextUrl.searchParams.get('q') || '');
  return adminJson({ ok: true, keys });
});

export const POST = adminHandler(async (req) => {
  const body = await readAdminBody(req);
  const keys = await createKeys(body, adminIp(req));
  return adminJson({ ok: true, keys }, 201);
});
