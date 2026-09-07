import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { QueryError } from "@/components/QueryError";

vi.mock("@iconify/react", () => ({ Icon: () => <svg aria-hidden="true" /> }));
it("announces a failure and allows keyboard retry", async () => {
  const retry = vi.fn(); const user = userEvent.setup();
  render(<QueryError message="The inventory could not be loaded" retry={retry} />);
  expect(screen.getByRole("alert")).toHaveTextContent("inventory could not be loaded");
  await user.tab(); expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
  await user.keyboard("{Enter}"); expect(retry).toHaveBeenCalledOnce();
});
