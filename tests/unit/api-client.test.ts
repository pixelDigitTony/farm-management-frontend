import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { api, restoreAccessToken, tokenStore } from "@/api/client";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

it("keeps public requests anonymous and never refreshes their sessions", async () => {
  tokenStore.set("private-token");
  let refreshes = 0;
  server.use(
    http.get("*/api/public/test", ({ request }) => {
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.credentials).toBe("omit");
      return HttpResponse.json({ message: "Unavailable" }, { status: 401 });
    }),
    http.post("*/api/auth/refresh", () => {
      refreshes++;
      return HttpResponse.json({ token: "new" });
    }),
  );
  await expect(api("/public/test")).rejects.toMatchObject({ status: 401 });
  expect(refreshes).toBe(0);
  expect(tokenStore.get()).toBe("private-token");
});

it("coalesces concurrent refreshes", async () => {
  tokenStore.set("expired");
  let refreshes = 0;
  server.use(
    http.get("*/api/resources/test", ({ request }) =>
      request.headers.get("authorization") === "Bearer fresh"
        ? HttpResponse.json({ items: [] })
        : HttpResponse.json({}, { status: 401 }),
    ),
    http.post("*/api/auth/refresh", () => {
      refreshes++;
      return HttpResponse.json({ token: "fresh" });
    }),
  );
  await Promise.all([api("/resources/test"), api("/resources/test")]);
  expect(refreshes).toBe(1);
  expect(tokenStore.get()).toBe("fresh");
});

it("does not resurrect a session when logout occurs during refresh", async () => {
  tokenStore.clear();
  let resolve!: (value: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const pending = restoreAccessToken();
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  tokenStore.clear();
  resolve(new Response(JSON.stringify({ token: "too-late" }), { status: 200 }));
  expect(await pending).toBeNull();
  expect(tokenStore.get()).toBeNull();
});
