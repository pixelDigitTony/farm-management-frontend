import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
}

/** Cache contents belong to an authenticated identity, including across browser tabs. */
export function bindSessionCache(client: QueryClient) {
  const clear = () => { void client.cancelQueries(); client.clear(); };
  const storage = (event: StorageEvent) => {
    if (event.key === "miss-v-user" && event.oldValue !== event.newValue) clear();
    if (event.key === null) clear();
  };
  window.addEventListener("miss-v-session-changed", clear);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("miss-v-session-changed", clear);
    window.removeEventListener("storage", storage);
  };
}
