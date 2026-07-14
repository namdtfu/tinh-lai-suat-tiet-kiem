const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
const SESSION_STORAGE_KEY = "tiet-kiem-cloud-session";

export type CloudSession = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  user: {
    email: string;
    id: string;
  };
};

type SupabaseTokenPayload = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  user?: {
    email?: string;
    id?: string;
  };
};

type CloudStateRow<T> = {
  data: T;
  updated_at: string;
};

export function isCloudConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function requireConfiguration() {
  if (!isCloudConfigured()) {
    throw new Error("Chưa cấu hình kết nối dữ liệu đám mây.");
  }
}

function requestHeaders(accessToken?: string) {
  requireConfiguration();
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function getErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    return String(
      payload.error_description ??
        payload.msg ??
        payload.message ??
        payload.error ??
        `Yêu cầu thất bại (${response.status})`,
    );
  } catch {
    return `Yêu cầu thất bại (${response.status})`;
  }
}

async function assertOk(response: Response) {
  if (!response.ok) throw new Error(await getErrorMessage(response));
}

function persistSession(session: CloudSession | null) {
  if (typeof window === "undefined") return;
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function normalizeTokenPayload(
  payload: SupabaseTokenPayload,
  fallbackRefreshToken = "",
): CloudSession | null {
  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token ?? fallbackRefreshToken;
  const userId = payload.user?.id;
  if (!accessToken || !refreshToken || !userId) return null;

  return {
    accessToken,
    expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
    refreshToken,
    user: {
      email: payload.user?.email ?? "",
      id: userId,
    },
  };
}

async function fetchCurrentUser(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: requestHeaders(accessToken),
  });
  await assertOk(response);
  const user = (await response.json()) as { email?: string; id?: string };
  if (!user.id) throw new Error("Không đọc được thông tin tài khoản.");
  return { email: user.email ?? "", id: user.id };
}

export async function sendMagicLink(email: string, redirectTo: string) {
  requireConfiguration();
  const endpoint = new URL(`${SUPABASE_URL}/auth/v1/otp`);
  endpoint.searchParams.set("redirect_to", redirectTo);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({
      create_user: false,
      email,
    }),
  });
  await assertOk(response);
}

export async function consumeMagicLinkSession() {
  if (typeof window === "undefined" || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const authError = params.get("error_description") ?? params.get("error");
  if (authError) {
    window.history.replaceState({}, "", window.location.pathname);
    throw new Error(authError);
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const user = await fetchCurrentUser(accessToken);
  const session: CloudSession = {
    accessToken,
    expiresAt:
      Date.now() + Math.max(60, Number(params.get("expires_in")) || 3600) * 1000,
    refreshToken,
    user,
  };
  persistSession(session);
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  return session;
}

async function refreshSession(refreshToken: string) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  await assertOk(response);
  const session = normalizeTokenPayload(
    (await response.json()) as SupabaseTokenPayload,
    refreshToken,
  );
  if (!session) throw new Error("Phiên đăng nhập không hợp lệ.");
  persistSession(session);
  return session;
}

export async function restoreCloudSession() {
  if (typeof window === "undefined" || !isCloudConfigured()) return null;
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) return null;

  try {
    const session = JSON.parse(stored) as CloudSession;
    if (
      !session.accessToken ||
      !session.refreshToken ||
      !session.user?.id ||
      !Number.isFinite(session.expiresAt)
    ) {
      persistSession(null);
      return null;
    }
    return await ensureCloudSession(session);
  } catch {
    persistSession(null);
    return null;
  }
}

export async function ensureCloudSession(session: CloudSession) {
  if (session.expiresAt <= Date.now() + 60_000) {
    return await refreshSession(session.refreshToken);
  }
  return session;
}

export async function signOutCloud(session: CloudSession | null) {
  try {
    if (session) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: requestHeaders(session.accessToken),
      });
    }
  } finally {
    persistSession(null);
  }
}

export async function readCloudState<T>(session: CloudSession) {
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/user_app_state`);
  endpoint.searchParams.set("select", "data,updated_at");
  endpoint.searchParams.set("user_id", `eq.${session.user.id}`);
  endpoint.searchParams.set("limit", "1");
  const response = await fetch(endpoint, {
    headers: requestHeaders(session.accessToken),
  });
  await assertOk(response);
  const rows = (await response.json()) as CloudStateRow<T>[];
  return rows[0] ?? null;
}

export async function writeCloudState<T>(session: CloudSession, data: T) {
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/user_app_state`);
  endpoint.searchParams.set("on_conflict", "user_id");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...requestHeaders(session.accessToken),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      data,
      schema_version: 1,
      updated_at: new Date().toISOString(),
      user_id: session.user.id,
    }),
  });
  await assertOk(response);
  const rows = (await response.json()) as CloudStateRow<T>[];
  return rows[0] ?? null;
}
