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

let refreshPromise: Promise<string | null> | null = null;

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

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { token: string };
        tokenStore.set(body.token);
        return body.token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await performRequest<T>(path, options);
  } catch (error) {
    const isAuthOperation = path.startsWith("/auth/login") || path.startsWith("/auth/register");
    if (error instanceof ApiError && error.status === 401 && !isAuthOperation) {
      const refreshed = await refreshAccessToken();
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
