/**
 * CORS headers shared by every browser-invoked edge function.
 *
 * These functions authenticate with a bearer JWT and never read cookies, so the request
 * origin is not an authorization boundary — an attacker cannot borrow a session by
 * calling them from another page. Even so, `ALLOWED_ORIGINS` (comma-separated) can be set
 * in Edge Function secrets to lock the responses down. When it is unset the requesting
 * origin is echoed back, which keeps local previews and preview deployments working.
 */

const CONFIGURED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

/** The requesting origin, or `null` when it is not on a configured allowlist. */
function resolveAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');

  if (CONFIGURED_ORIGINS.length === 0) return origin ?? '*';
  if (CONFIGURED_ORIGINS.includes('*')) return '*';
  if (origin && CONFIGURED_ORIGINS.includes(origin)) return origin;

  return null;
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, stripe-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };

  const allowOrigin = resolveAllowedOrigin(req);
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;

  return headers;
}

/** An OPTIONS preflight response. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(req) });
}

export function jsonResponse(payload: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}

/** A JSON error response with a `message` field the client can display. */
export function jsonError(message: string, status: number, req: Request): Response {
  return jsonResponse({ error: message }, status, req);
}
