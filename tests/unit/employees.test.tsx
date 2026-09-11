import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { EmployeesPage } from "@/pages/EmployeesPage";

vi.mock("@/api/client", () => ({
  api: vi.fn(),
  sessionUserStore: { get: () => ({ isHighestRole: true }) },
}));
vi.mock("qrcode.react", () => ({ QRCodeSVG: () => <svg /> }));
const initial = {
  users: [],
  business: {
    businessName: "Test",
    ownerRole: 5,
    roles: [
      { level: 5, name: "Owner" },
      { level: 1, name: "Staff" },
    ],
  },
  invites: [{ _id: "invite-1", tokenId: "token", role: 5, isActive: true, registrationCount: 2 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockImplementation(async (_path, options) => (options?.method ? {} : initial));
});
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EmployeesPage />
    </QueryClientProvider>,
  );
}
it("moves creation into Roles and submits only the new role name and level", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByRole("tab", { name: "Roles" });
  expect(screen.queryByText("Create named role")).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Roles" }));
  expect(screen.getByText("Create named role")).toBeVisible();
  expect(screen.queryByText(/Name current owner/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Numeric level" }), {
    target: { value: "8" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Role name" }), {
    target: { value: "Director" },
  });
  await user.click(screen.getByRole("button", { name: "Create role" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/employees/roles", {
      method: "POST",
      body: JSON.stringify({ level: 8, name: "Director" }),
    }),
  );
});
it("edits role names and deletes unused roles from the table", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mount();
  await user.click(await screen.findByRole("tab", { name: "Roles" }));
  const staff = within(screen.getByRole("row", { name: /1 Staff/ }));
  await user.click(staff.getByRole("button", { name: "Edit" }));
  await user.clear(staff.getByRole("textbox"));
  await user.type(staff.getByRole("textbox"), "Farm staff");
  await user.click(staff.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/employees/roles/1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Farm staff" }),
    }),
  );
  await waitFor(() => expect(staff.getByRole("button", { name: "Delete" })).toBeEnabled());
  await user.click(staff.getByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/employees/roles/1", { method: "DELETE", body: undefined }),
  );
  expect(
    within(screen.getByRole("row", { name: /Highest.*Owner/ })).getByRole("button", {
      name: "Delete",
    }),
  ).toBeDisabled();
});
it("deletes registration links only after confirmation", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  mount();
  await user.click(await screen.findByRole("button", { name: "Delete" }));
  expect(api).not.toHaveBeenCalledWith("/employees/invites/invite-1", expect.anything());
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/employees/invites/invite-1", {
      method: "DELETE",
      body: undefined,
    }),
  );
});

it("edits module permissions and removes action permissions when View is unchecked", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole("tab", { name: "Roles" }));
  await user.click(
    within(screen.getByRole("row", { name: /1 Staff/ })).getByRole("button", {
      name: "Permissions",
    }),
  );
  const dialog = within(screen.getByRole("dialog"));
  await user.click(dialog.getByRole("checkbox", { name: "Product Catalog: create" }));
  expect(dialog.getByRole("checkbox", { name: "Product Catalog: view" })).toBeChecked();
  await user.click(dialog.getByRole("checkbox", { name: "Inventory: view" }));
  expect(dialog.getByRole("checkbox", { name: "Inventory: create" })).not.toBeChecked();
  expect(dialog.getByRole("checkbox", { name: "Inventory: edit" })).not.toBeChecked();
  expect(dialog.getByRole("checkbox", { name: "Inventory: delete" })).not.toBeChecked();
  await user.click(dialog.getByRole("button", { name: "Save permissions" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/employees/roles/1/permissions",
      expect.objectContaining({ method: "PUT" }),
    ),
  );
  const call = vi
    .mocked(api)
    .mock.calls.find(([path]) => path === "/employees/roles/1/permissions");
  const permissions = JSON.parse(String(call?.[1]?.body)).permissions;
  expect(permissions).toContain("catalog:create");
  expect(permissions).toContain("catalog:view");
  expect(permissions).not.toContain("inventory:delete");
});

it("discards unsaved permission changes on Cancel", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole("tab", { name: "Roles" }));
  const permissionsButton = within(screen.getByRole("row", { name: /1 Staff/ })).getByRole(
    "button",
    { name: "Permissions" },
  );
  await user.click(permissionsButton);
  await user.click(screen.getByRole("checkbox", { name: "Product Catalog: view" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  await user.click(permissionsButton);
  expect(screen.getByRole("checkbox", { name: "Product Catalog: view" })).not.toBeChecked();
});
