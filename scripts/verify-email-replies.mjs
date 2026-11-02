import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.EMAIL_REPLIES_TEST_URL ?? "http://127.0.0.1:4187";
const output = "test-results/order-email-replies";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const owner = {
  id: "manager",
  name: "Owner",
  email: "owner@example.test",
  role: 5,
  roleName: "Owner",
  status: "ACTIVE",
  isApproved: true,
  emailVerified: true,
  isHighestRole: true,
  businessName: "Test Farm",
};
const order = {
  _id: "order-a",
  orderNumber: "WEB-TEST-01",
  customer: { name: "Test Buyer", email: "buyer@example.test", phone: "09171234567" },
  status: "PENDING",
  createdAt: new Date().toISOString(),
  items: [],
  total: "100.00",
  fulfillmentMethod: "PICKUP",
  paymentMethod: "PAY_ON_PICKUP",
  statusHistory: [],
};
const reply = {
  _id: "reply-a",
  sequence: 1,
  bodyText: "Can I collect tomorrow?",
  senderKind: "CUSTOMER",
  senderName: "Test Buyer",
  direction: "INBOUND",
  deliveryState: "RECEIVED",
  createdAt: new Date().toISOString(),
  receivedAt: "2026-11-01T08:00:00Z",
  recovered: true,
};
const results = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 1000 : 844 },
    });
    const page = await context.newPage();
    const errors = [];
    let healthy = false;
    let historyReads = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((user) => {
      localStorage.setItem("miss-v-token", "fixture");
      localStorage.setItem("miss-v-user", JSON.stringify(user));
    }, owner);
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!["fetch", "xhr"].includes(request.resourceType()))
        return request.url().startsWith(base) ? route.continue() : route.abort();
      const path = new URL(request.url()).pathname;
      const send = (json) => route.fulfill({ json });
      if (path.endsWith("/auth/me")) return send({ owner });
      if (path.endsWith("/orders/email-health"))
        return send({
          status: healthy ? "HEALTHY" : "INCOMPLETE",
          pending: 0,
          failed: 0,
          review: healthy ? 0 : 1,
          reasons: healthy ? [] : ["MISSING_SIGNINGSECRET", "RECEIVING_WEBHOOK_MISSING"],
        });
      if (path.endsWith("/orders/email-settings"))
        return send({
          enabled: true,
          configured: healthy,
          provider: "resend",
          recipient: owner,
          canConfigure: true,
          candidates: [],
        });
      if (path.endsWith("/orders/inbox"))
        return send({
          items: [
            {
              _id: "conversation-a",
              orderId: order._id,
              orderNumber: order.orderNumber,
              customer: order.customer,
              lastExcerpt: reply.bodyText,
              lastMessageAt: reply.createdAt,
              unreadCount: 1,
            },
          ],
          nextCursor: null,
        });
      if (path.endsWith("/messages/read")) return send({ saved: true });
      if (path.endsWith("/messages")) {
        historyReads++;
        return send({ configured: healthy, order, items: [reply], nextCursor: null });
      }
      if (path.endsWith("/orders")) return send({ items: [order], pendingCount: 1 });
      return send({ items: [] });
    });
    await page.goto(`${base}/orders`);
    await page.getByRole("button", { name: "Messages", exact: true }).first().click();
    await page
      .getByRole("log", { name: "Order message history" })
      .getByText("Can I collect tomorrow?", { exact: true })
      .waitFor();
    await page.getByText(/Customer replies are not connected yet/).waitFor();
    await page.getByText(/Recovered reply/).waitFor();
    assert(await page.getByRole("textbox", { name: "Email message" }).isDisabled());
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const accessibility = await new AxeBuilder({ page })
      .include('section[aria-label="Order email inbox"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    assert.deepEqual(
      accessibility.violations.map((item) => item.id),
      [],
    );
    await page.screenshot({ path: `${output}/disconnected-${width}.png`, fullPage: true });
    const previousReads = historyReads;
    healthy = true;
    await page.getByRole("button", { name: "Refresh messages", exact: true }).click();
    await page.getByText("Customer replies are connected.", { exact: true }).waitFor();
    assert(historyReads > previousReads);
    assert(await page.getByRole("textbox", { name: "Email message" }).isEnabled());
    assert.deepEqual(errors, []);
    results.push({
      width,
      receivingStates: ["INCOMPLETE", "HEALTHY"],
      savedHistoryVisible: true,
      refreshReloadsHistory: true,
      horizontalOverflow: false,
      a11yViolations: accessibility.violations.length,
    });
    await context.close();
  }
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      { evidence: "Mocked HTTP browser acceptance; no live email delivery", results },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
