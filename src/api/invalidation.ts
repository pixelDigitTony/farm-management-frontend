import type { QueryClient } from "@tanstack/react-query";

const effects = {
  cash: ["cash-accounts", "cash-transactions", "dashboard", "reports"],
  expense: ["expenses", "cash-accounts", "cash-transactions", "dashboard", "reports"],
  inventory: ["inventory", "inventory-lots", "inventory-movements", "dashboard", "reports"],
  receipt: ["inventory", "inventory-lots", "inventory-movements", "expenses", "cash-accounts", "cash-transactions", "dashboard", "reports"],
} as const;

export function invalidateOperation(client: QueryClient, operation: keyof typeof effects) {
  return Promise.all(effects[operation].map((key) => client.invalidateQueries({ queryKey: [key] })));
}
