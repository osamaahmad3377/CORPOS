import { publicHandler, json, preflight } from '@/lib/api.js';
import { getPublicKeyBase64, unixNow } from '@/lib/crypto.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = publicHandler(async () => {
  return json({ ok: true, public_key: getPublicKeyBase64(), server_time: unixNow() });
});

export function OPTIONS() {
  return preflight();
}
