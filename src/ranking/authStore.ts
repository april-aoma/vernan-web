/**
 * Session token for the Vernan scores auth API (localStorage).
 */

export type AuthSession = {
  token: string;
  userId: string;
  username: string;
  displayName: string;
};

const SESSION_KEY = "vernan-web-auth";

function scoresApiBase(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("scoresApi");
    if (fromQuery) return fromQuery.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  const fromEnv = import.meta.env.VITE_SCORES_API;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return null;
}

export function loadAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof o.token !== "string" ||
      typeof o.userId !== "string" ||
      typeof o.username !== "string" ||
      typeof o.displayName !== "string" ||
      !o.token
    ) {
      return null;
    }
    return {
      token: o.token,
      userId: o.userId,
      username: o.username,
      displayName: o.displayName,
    };
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const session = loadAuthSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  if (extra) {
    const e = new Headers(extra);
    e.forEach((v, k) => {
      headers[k] = v;
    });
  }
  return headers;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    /* ignore */
  }
  return `Auth failed (${res.status})`;
}

function parseSession(data: Record<string, unknown>): AuthSession {
  if (
    typeof data.token !== "string" ||
    typeof data.userId !== "string" ||
    typeof data.username !== "string" ||
    typeof data.displayName !== "string"
  ) {
    throw new Error("Invalid auth response");
  }
  return {
    token: data.token,
    userId: data.userId,
    username: data.username,
    displayName: data.displayName,
  };
}

export async function registerAccount(
  username: string,
  password: string,
  displayName?: string,
): Promise<AuthSession> {
  const api = scoresApiBase();
  if (!api) throw new Error("Scores API not configured");
  const res = await fetch(`${api}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      displayName: displayName ?? username,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const session = parseSession((await res.json()) as Record<string, unknown>);
  saveAuthSession(session);
  return session;
}

export async function loginAccount(username: string, password: string): Promise<AuthSession> {
  const api = scoresApiBase();
  if (!api) throw new Error("Scores API not configured");
  const res = await fetch(`${api}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const session = parseSession((await res.json()) as Record<string, unknown>);
  saveAuthSession(session);
  return session;
}

export async function logoutAccount(): Promise<void> {
  const api = scoresApiBase();
  const session = loadAuthSession();
  clearAuthSession();
  if (!api || !session) return;
  try {
    await fetch(`${api}/api/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
    });
  } catch {
    /* ignore */
  }
}

export function isLoggedIn(): boolean {
  return loadAuthSession() != null;
}
