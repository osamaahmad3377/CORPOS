import { publicHandler, readJsonBody, clientIp, ok, preflight } from '@/lib/api.js';
import { parseLicenseRequest, activate } from '@/lib/licensing.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = publicHandler(async (req) => {
  const body = await readJsonBody(req);
  const license = await activate({ ...parseLicenseRequest(body), ip: clientIp(req) });
  return ok({ license });
});

export function OPTIONS() {
  return preflight();
}
