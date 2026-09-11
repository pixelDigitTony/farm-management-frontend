import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { sessionUserStore } from "@/api/client";
import { Button } from "@/components/ui/button";
import { canAccess } from "@/lib/permissions";

vi.mock("@/api/client", () => ({ sessionUserStore: { get: vi.fn() } }));
it("disables writes for a view-only role and leaves allowed controls usable", () => {
  const user = {
    id: "staff",
    name: "Staff",
    email: "s@example.test",
    phone: "",
    role: 1,
    roleName: "Stock viewer",
    status: "ACTIVE",
    isApproved: true,
    emailVerified: true,
    isHighestRole: false,
    businessName: "Test",
    permissions: ["inventory:view"],
  };
  vi.mocked(sessionUserStore.get).mockReturnValue(user);
  render(
    <>
      <Button permission={{ path: "/operations/inventory-receipts", method: "POST" }}>
        Receive stock
      </Button>
      <Button permission={{ path: "/resources/inventory-items" }}>View stock</Button>
    </>,
  );
  expect(screen.getByRole("button", { name: "Receive stock" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "View stock" })).toBeEnabled();
  expect(canAccess(user, "inventory")).toBe(true);
  expect(canAccess(user, "cash-flow")).toBe(false);
  expect(canAccess(user, "employees")).toBe(false);
});
it("keeps highest-role access without granting super-admin access", () => {
  const user = { role: 5, isHighestRole: true, permissions: [] };
  expect(canAccess(user, "employees")).toBe(true);
  expect(canAccess(user, "inventory", "delete")).toBe(true);
  expect(canAccess(user, "admin")).toBe(false);
});
