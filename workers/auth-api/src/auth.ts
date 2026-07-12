/**
 * Username/password accounts + HMAC JWT for the Vernan auth API.
 * Accounts are stored in the AUTH KV namespace under auth:user:* keys.
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

type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
};

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const PBKDF2_ITERATIONS = 100_000;
const TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

function userKey(username: string): string {
  return `auth:user:${username.toLowerCase()}`;
}

export function sanitizeDisplayName(raw: unknown): string {
  const s = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 20) : "";
  return s.length > 0 ? s : "Anonymous";
}

export function validateUsername(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Invalid username");
  const u = raw.trim();
  if (!USERNAME_RE.test(u)) {
    throw new Error("Username must be 3–20 letters, numbers, or underscores");
  }
  return u;
}

export function validatePassword(raw: unknown): string {
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 128) {
    throw new Error("Password must be 8–128 characters");
  }
  return raw;
}

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;
  const salt = b64urlDecode(parts[2]!);
  const expected = b64urlDecode(parts[3]!);
  const key = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    expected.length * 8,
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

export async function signJwt(user: AuthUser, secret: string): Promise<string> {
  const header = b64urlEncode(utf8(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
  };
  const body = b64urlEncode(utf8(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, utf8(data));
  return `${data}.${b64urlEncode(sig)}`;
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

export async function requireAuth(
  request: Request,
  secret: string,
): Promise<{ user: AuthUser } | { error: string; status: number }> {
  const result = await optionalAuth(request, secret);
  if ("error" in result) return result;
  if (!result.user) {
    return { error: "Login required", status: 401 };
  }
  return { user: result.user };
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

export async function createUser(
  kv: KVNamespace,
  username: string,
  password: string,
  displayName: string,
): Promise<AuthUser> {
  const key = userKey(username);
  const existing = await kv.get(key);
  if (existing) {
    throw new Error("Username already taken");
  }
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const row: StoredUser = {
    id,
    username,
    passwordHash,
    displayName,
    createdAt,
  };
  // Create-if-absent: KV put is not atomic with get; race may overwrite — acceptable for v1.
  await kv.put(key, JSON.stringify(row));
  return { id, username, displayName };
}

export async function findUserByUsername(
  kv: KVNamespace,
  username: string,
): Promise<StoredUser | null> {
  const raw = await kv.get(userKey(username));
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as StoredUser;
    if (
      typeof row.id !== "string" ||
      typeof row.username !== "string" ||
      typeof row.passwordHash !== "string" ||
      typeof row.displayName !== "string"
    ) {
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

export async function authenticateUser(
  kv: KVNamespace,
  username: string,
  password: string,
): Promise<AuthUser | null> {
  const row = await findUserByUsername(kv, username);
  if (!row) return null;
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: sanitizeDisplayName(row.displayName),
  };
}
