const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => localStorage.getItem("miss-v-token"),
  set: (token: string) => localStorage.setItem("miss-v-token", token),
  clear: () => localStorage.removeItem("miss-v-token"),
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: number;
  roleName: string;
  status: string;
  isApproved: boolean;
  emailVerified: boolean;
  isHighestRole: boolean;
  businessName: string;
};

export const sessionUserStore = {
  get: (): SessionUser | null => {
    try {
      const value = localStorage.getItem("miss-v-user");
      return value ? (JSON.parse(value) as SessionUser) : null;
    } catch {
      return null;
    }
  },
  set: (user: SessionUser) => localStorage.setItem("miss-v-user", JSON.stringify(user)),
  clear: () => localStorage.removeItem("miss-v-user"),
};

let refreshPromise: Promise<string | null> | null = null;
const refreshLockName = "miss-v-auth-refresh";

async function performRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.message ?? "Request failed",
      response.status,
      body?.code,
      body?.details,
    );
  }
  return body as T;
}

async function runWithRefreshLock<T>(callback: () => Promise<T>) {
  if (!("locks" in navigator)) return callback();
  return navigator.locks.request(refreshLockName, callback);
}

async function refreshAccessToken(failedToken: string | null) {
  if (!refreshPromise) {
    refreshPromise = runWithRefreshLock(async () => {
      const currentToken = tokenStore.get();
      if (currentToken && currentToken !== failedToken) return currentToken;

      const refreshRequest = () =>
        fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
      let response = await refreshRequest();
      if (response.status === 409) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        const concurrentlyRefreshedToken = tokenStore.get();
        if (concurrentlyRefreshedToken && concurrentlyRefreshedToken !== failedToken) {
          return concurrentlyRefreshedToken;
        }
        response = await refreshRequest();
      }
      if (!response.ok) return null;
      const body = (await response.json()) as { token: string };
      tokenStore.set(body.token);
      return body.token;
    })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export function restoreAccessToken() {
  return refreshAccessToken(null);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const requestToken = tokenStore.get();
  try {
    return await performRequest<T>(path, options);
  } catch (error) {
    const isAuthOperation = path.startsWith("/auth/login") || path.startsWith("/auth/register");
    if (error instanceof ApiError && error.status === 401 && !isAuthOperation) {
      const refreshed = await refreshAccessToken(requestToken);
      if (refreshed) return performRequest<T>(path, options);
      tokenStore.clear();
    }
    throw error;
  }
}

export const resources = {
  list: <T>(name: string, query = "") =>
    api<{ items: T[]; total: number }>(`/resources/${name}${query}`),
  create: <T>(name: string, data: unknown) =>
    api<T>(`/resources/${name}`, { method: "POST", body: JSON.stringify(data) }),
  update: <T>(name: string, id: string, data: unknown) =>
    api<T>(`/resources/${name}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (name: string, id: string) => api<void>(`/resources/${name}/${id}`, { method: "DELETE" }),
};
