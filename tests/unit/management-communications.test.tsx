import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/api/client";
import { TemporaryMpin } from "@/components/employees/TemporaryMpin";
import { LandingStatisticsDialog } from "@/components/landing-page/LandingStatisticsDialog";
import { OrderEmailInbox } from "@/components/orders/OrderEmailInbox";
import { useLandingAnalytics } from "@/hooks/useLandingAnalytics";

vi.mock("@/api/client", () => ({
  api: vi.fn(),
  sessionUserStore: { get: () => ({ id: "staff-A", isHighestRole: true, role: 5 }) },
}));
const mount = (element: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      {element}
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
});

describe("temporary MPIN", () => {
  function Editor() {
    const [value, setValue] = useState("");
    return (
      <>
        <TemporaryMpin value={value} onChange={setValue} />
        <output data-testid="mpin-value">{value}</output>
      </>
    );
  }
  it("uses six numeric slots, preserves leading zero and keeps Cancel reversible", async () => {
    const user = userEvent.setup();
    mount(<Editor />);
    await user.click(screen.getByRole("button", { name: "Set temporary MPIN" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getAllByRole("spinbutton")).toHaveLength(6);
    expect(dialog.getByRole("button", { name: "Use MPIN" })).toBeDisabled();
    for (const digit of "048297") await user.click(dialog.getByRole("button", { name: digit }));
    await user.click(dialog.getByRole("button", { name: "Use MPIN" }));
    expect(screen.getByTestId("mpin-value")).toHaveTextContent("048297");
    await user.click(screen.getByRole("button", { name: "Set temporary MPIN" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("mpin-value")).toHaveTextContent("048297");
  });
  it("rejects weak values and malformed paste", async () => {
    const user = userEvent.setup();
    mount(<Editor />);
    await user.click(screen.getByRole("button", { name: "Set temporary MPIN" }));
    for (let i = 0; i < 6; i++) await user.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByRole("button", { name: "Use MPIN" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("less predictable");
    fireEvent.paste(screen.getByRole("dialog"), { clipboardData: { getData: () => "12e456" } });
    expect(screen.getByRole("status")).toHaveTextContent("Paste exactly 6 numbers");
  });
});
it("shows statistics failures instead of fabricated zeros", async () => {
  vi.mocked(api).mockRejectedValue(new Error("Statistics temporarily unavailable"));
  mount(
    <LandingStatisticsDialog
      page={{
        _id: "page-a",
        slug: "farm",
        siteTitle: "Farm",
        seoDescription: "",
        isPublished: true,
      }}
      onClose={() => {}}
    />,
  );
  expect(await screen.findByText("Statistics temporarily unavailable")).toBeVisible();
  expect(screen.queryByText("No visits recorded in this period.")).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledWith(
    expect.stringContaining("/pages/page-a/statistics?"),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it("shows persisted email messages and sends the composer through the email API", async () => {
  const user = userEvent.setup();
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === "/orders/email-settings")
      return {
        enabled: true,
        configured: true,
        provider: "resend",
        recipient: { id: "staff-A", name: "Owner", email: "owner@example.test" },
        candidates: [],
        canConfigure: false,
      };
    if (path.startsWith("/orders/inbox")) return { items: [], nextCursor: null };
    if (options?.method) return {};
    return {
      configured: true,
      order: {
        _id: "order-a",
        orderNumber: "WEB-A",
        status: "PENDING",
        customer: { name: "Buyer", email: "buyer@example.test" },
      },
      items: [
        {
          _id: "message-a",
          sequence: 1,
          bodyText: "Can I collect tomorrow?",
          direction: "INBOUND",
          senderKind: "CUSTOMER",
          deliveryState: "RECEIVED",
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
    };
  });
  mount(<OrderEmailInbox visible initialOrderId="order-a" onViewOrder={() => {}} />);
  expect(await screen.findByText("Can I collect tomorrow?")).toBeVisible();
  await user.type(screen.getByRole("textbox", { name: "Email message" }), "Yes, tomorrow is fine");
  await user.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/orders/order-a/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Yes, tomorrow is fine"),
      }),
    ),
  );
});
it("respects analytics decline and emits one page view after consent", async () => {
  vi.mocked(api).mockResolvedValue({ accepted: true });
  function Visitor() {
    const analytics = useLandingAnalytics("farm", "page-a", true);
    return (
      <>
        <button type="button" onClick={() => analytics.choose("accepted")}>
          Allow
        </button>
        <button type="button" onClick={() => analytics.choose("declined")}>
          Decline
        </button>
        <button type="button" onClick={() => analytics.track("checkout_started")}>
          Checkout
        </button>
      </>
    );
  }
  const user = userEvent.setup();
  mount(<Visitor />);
  await user.click(screen.getByText("Decline"));
  await user.click(screen.getByText("Checkout"));
  expect(api).not.toHaveBeenCalled();
  await user.click(screen.getByText("Allow"));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  const body = JSON.parse(vi.mocked(api).mock.calls[0]![1]!.body as string);
  expect(body.events[0].type).toBe("page_view");
  expect(body.events[0]).not.toHaveProperty("businessId");
});
