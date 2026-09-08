import { useQuery } from "@tanstack/react-query";
import { resources, sessionUserStore } from "@/api/client";
import type { InventoryItem } from "@/types/domain";
import type { CashAccount, InventoryLot, InventoryMovement } from "./types";

export function useInventoryQueries() {
  const identity = sessionUserStore.get()?.id ?? "anonymous";
  const inventory = useQuery({
    queryKey: ["inventory", identity],
    queryFn: ({ signal }) => resources.list<InventoryItem>("inventory-items", "", signal),
  });
  const lots = useQuery({
    queryKey: ["inventory-lots", identity],
    queryFn: ({ signal }) =>
      resources.list<InventoryLot>("inventory-lots", "?limit=100&sort=-receivedDate", signal),
  });
  const movements = useQuery({
    queryKey: ["inventory-movements", identity],
    queryFn: ({ signal }) =>
      resources.list<InventoryMovement>(
        "inventory-movements",
        "?limit=100&sort=-movementDate",
        signal,
      ),
  });
  const accounts = useQuery({
    queryKey: ["cash-accounts", identity],
    queryFn: ({ signal }) => resources.list<CashAccount>("cash-accounts", "?limit=100", signal),
  });
  return { inventory, lots, movements, accounts };
}
