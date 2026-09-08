import { expect, it } from "vitest";
import { invalidateOperation } from "@/api/invalidation";
import { bindSessionCache, createQueryClient } from "@/api/query-client";

it("refreshes every cash dependency after an expense correction", async () => {
  const client = createQueryClient();
  const keys = [
    "expenses",
    "cash-accounts",
    "cash-transactions",
    "dashboard",
    "reports",
    "calendar",
  ];
  for (const key of keys) client.setQueryData([key, "owner"], { old: true });
  await invalidateOperation(client, "expense");
  for (const key of keys.slice(0, -1))
    expect(client.getQueryState([key, "owner"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["calendar", "owner"])?.isInvalidated).toBe(false);
  client.clear();
});

it("clears private cached data on account changes and removes its listeners", () => {
  const client = createQueryClient();
  const unbind = bindSessionCache(client);
  client.setQueryData(["inventory"], { private: true });
  window.dispatchEvent(new Event("miss-v-session-changed"));
  expect(client.getQueryData(["inventory"])).toBeUndefined();
  client.setQueryData(["inventory"], { private: true });
  window.dispatchEvent(
    new StorageEvent("storage", { key: "miss-v-user", oldValue: "a", newValue: "b" }),
  );
  expect(client.getQueryData(["inventory"])).toBeUndefined();
  unbind();
  client.setQueryData(["inventory"], "after-unmount");
  window.dispatchEvent(new Event("miss-v-session-changed"));
  expect(client.getQueryData(["inventory"])).toBe("after-unmount");
  client.clear();
});
