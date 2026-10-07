import { publicHandler, readJsonBody, clientIp, ok, preflight } from '@/lib/api.js';
import { parseLicenseRequest, deactivate } from '@/lib/licensing.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = publicHandler(async (req) => {
  const body = await readJsonBody(req);
  await deactivate({ ...parseLicenseRequest(body), ip: clientIp(req) });
  return ok();
});

export function OPTIONS() {
  return preflight();
}
