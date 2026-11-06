import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "@/api/client";
import { PublicAccessControl } from "@/components/landing-page/editor/PublicAccessControl";
import type { LandingPageRecord } from "@/types/landing-page";

const page: LandingPageRecord = {
  _id: "page-one",
  slug: "shop",
  siteTitle: "Shop",
  seoDescription: "",
  isPublished: true,
  isAccessible: false,
  accessStatus: "Inactive",
  revision: 3,
};
afterEach(() => vi.restoreAllMocks());
describe("public access controls", () => {
  it("requires confirmation and cancel does not mutate", () => {
    const api = vi.spyOn(client, "api");
    render(<PublicAccessControl page={page} canEdit refresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("dialog")).toHaveTextContent("Make landing page active");
    expect(screen.getByRole("switch", { hidden: true })).not.toBeChecked();
    fireEvent.click(screen.getByText("Cancel", { selector: "button" }));
    expect(api).not.toHaveBeenCalled();
  });
  it("submits a limited window with timezone/revision and refreshes status", async () => {
    const api = vi.spyOn(client, "api").mockResolvedValue({ ...page, accessStatus: "Active" });
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<PublicAccessControl page={page} canEdit refresh={refresh} />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByLabelText("Activation"), { target: { value: "LIMITED" } });
    fireEvent.change(screen.getByLabelText("End date and time"), {
      target: { value: "2030-01-01T10:00" },
    });
    fireEvent.click(screen.getByText("Confirm live window"));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    const [path, options] = api.mock.calls[0]!;
    expect(path).toBe("/landing-page/pages/page-one/access");
    expect(JSON.parse(options!.body as string)).toMatchObject({
      mode: "LIMITED",
      startNow: true,
      endLocal: "2030-01-01T10:00",
      timezone: "Asia/Manila",
      expectedPageRevision: 3,
    });
    expect(new Headers(options!.headers).get("Idempotency-Key")).toBeTruthy();
  });
  it("retains inputs and operation key across a failed retry", async () => {
    const api = vi
      .spyOn(client, "api")
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValue(page);
    render(<PublicAccessControl page={page} canEdit refresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("Make active"));
    await screen.findByText("Connection lost");
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByText("Make active"));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api.mock.calls[0]![1]!.headers).toEqual(api.mock.calls[1]![1]!.headers);
  });
  it("blocks activation for unpublished pages and read-only users", () => {
    const view = render(
      <PublicAccessControl page={{ ...page, isPublished: false }} canEdit refresh={vi.fn()} />,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
    view.rerender(<PublicAccessControl page={page} canEdit={false} refresh={vi.fn()} />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});
