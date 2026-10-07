import { NextResponse } from 'next/server';
import { unixNow } from './crypto.js';

export const MAX_BODY_BYTES = 10 * 1024;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const STATUS_BY_CODE = {
  BAD_REQUEST: 400,
  INVALID_KEY: 404,
  REVOKED: 403,
  EXPIRED: 403,
  ACTIVATION_LIMIT: 409,
  NOT_ACTIVATED: 403,
  SERVER_ERROR: 500,
};

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}

export function ok(extra = {}) {
  return json({ ok: true, ...extra, server_time: unixNow() }, 200);
}

export function fail(code, message) {
  return json({ ok: false, code, message, server_time: unixNow() }, STATUS_BY_CODE[code] || 400);
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || null;
}

/** Read a JSON object body, enforcing the 10KB limit. Throws ApiError(BAD_REQUEST). */
export async function readJsonBody(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) throw new ApiError('BAD_REQUEST', 'Request body too large (max 10KB).');
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw new ApiError('BAD_REQUEST', 'Request body too large (max 10KB).');
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError('BAD_REQUEST', 'Request body must be valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('BAD_REQUEST', 'Request body must be a JSON object.');
  }
  return body;
}

/** Wrap a public handler: maps ApiError -> fail(), anything else -> SERVER_ERROR. */
export function publicHandler(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.message);
      console.error('[license-api]', err);
      return fail('SERVER_ERROR', 'The license server encountered an error. Please try again later.');
    }
  };
}
