/**
 * JWT verification for the Vernan scores API.
 * Tokens are issued by the separate vernan-auth worker (same AUTH_SECRET).
 */

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
};

export type JwtPayload = {
  sub: string;
  username: string;
  displayName: string;
  exp: number;
  iat: number;
};

function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function sanitizeDisplayName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 20) : "";
  return s.length > 0 ? s : "Anonymous";
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const data = `${header}.${body}`;
  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), utf8(data));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as JwtPayload;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerToken(request: Request): string | null {
  const h = request.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}

/**
 * Returns the authenticated user when a valid Bearer token is present.
 * Missing token → guest (`user: null`). Invalid token → error.
 */
export async function optionalAuth(
  request: Request,
  secret: string,
): Promise<{ user: AuthUser | null } | { error: string; status: number }> {
  const token = bearerToken(request);
  if (!token) {
    return { user: null };
  }
  if (!secret) {
    return { error: "Auth not configured", status: 503 };
  }
  const payload = await verifyJwt(token, secret);
  if (!payload) {
    return { error: "Invalid or expired token", status: 401 };
  }
  return {
    user: {
      id: payload.sub,
      username: payload.username,
      displayName: sanitizeDisplayName(payload.displayName),
    },
  };
}
