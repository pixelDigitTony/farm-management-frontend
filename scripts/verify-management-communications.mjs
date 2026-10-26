import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const base = process.env.MANAGEMENT_TEST_URL ?? "http://127.0.0.1:4187";
const output = "test-results/management-communications";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const user = {
  id: "manager",
  name: "Test Owner",
  email: "owner@example.test",
  role: 5,
  roleName: "Owner",
  status: "ACTIVE",
  isApproved: true,
  emailVerified: true,
  isHighestRole: true,
  businessName: "Test Farm",
  phone: "+639171234567",
};
const pageRecord = {
  _id: "page-a",
  slug: "test-farm",
  name: "Farm shop",
  siteTitle: "Test Farm",
  seoDescription: "",
  isPublished: true,
  publishedAt: new Date().toISOString(),
};
const order = {
  _id: "order-a",
  orderNumber: "WEB-TEST-01",
  customer: { name: "Test Buyer", email: "buyer@example.test", phone: "+639171234568" },
  status: "PENDING",
  createdAt: new Date().toISOString(),
  items: [],
  total: "100.00",
  fulfillmentMethod: "PICKUP",
  paymentMethod: "PAY_ON_PICKUP",
  statusHistory: [],
};
const messages = [
  {
    _id: "message-a",
    sequence: 1,
    bodyText: "Can I collect my order tomorrow morning?",
    senderKind: "CUSTOMER",
    senderName: "Test Buyer",
    direction: "INBOUND",
    deliveryState: "RECEIVED",
    createdAt: new Date().toISOString(),
  },
];
const statistics = {
  enabled: true,
  generatedAt: new Date().toISOString(),
  trackingStartsAt: new Date().toISOString(),
  summary: {
    uniqueVisitors: 7,
    visits: 8,
    pageViews: 12,
    ordersCreated: 2,
    ctaClicks: 3,
    checkoutStarts: 2,
    convertedVisits: 2,
    conversionRate: 25,
  },
  daily: [
    { date: "2026-10-23", visitors: 3, views: 5 },
    { date: "2026-10-24", visitors: 4, views: 7 },
  ],
  referrers: [{ _id: "direct/unknown", count: 12 }],
  devices: [{ _id: "mobile", count: 12 }],
};
const results = [],
  errors = [],
  requests = [];
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((owner) => {
    localStorage.setItem("miss-v-token", "fixture");
    localStorage.setItem("miss-v-user", JSON.stringify(owner));
  }, user);
  await page.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      pathname = url.pathname;
    if (!["fetch", "xhr"].includes(req.resourceType()))
      return req.url().startsWith(base) ? route.continue() : route.abort();
    if (!pathname.startsWith("/api/"))
      return req.url().startsWith(base) ? route.continue() : route.abort();
    requests.push({ path: pathname, method: req.method(), payload: req.postDataJSON() });
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (pathname.endsWith("/auth/me")) return send({ owner: user });
    if (pathname === "/api/employees")
      return send({
        users: [],
        business: {
          businessName: "Farm",
          ownerRole: 5,
          roles: [
            { level: 5, name: "Owner" },
            { level: 1, name: "Staff" },
          ],
        },
        invites: [],
      });
    if (pathname === "/api/employees/accounts")
      return send({ emailDelivery: { status: "FAILED" } }, 201);
    if (pathname === "/api/landing-page/pages") return send({ items: [pageRecord] });
    if (pathname.endsWith("/statistics")) return send(statistics);
    if (pathname.endsWith("/orders/email-settings"))
      return send({
        enabled: true,
        configured: true,
        provider: "resend",
        recipient: { id: "manager", name: "Owner", email: "owner@example.test" },
        canConfigure: false,
        candidates: [],
      });
    if (pathname.endsWith("/orders/inbox"))
      return send({
        items: [
          {
            _id: "conversation-a",
            orderId: "order-a",
            orderNumber: order.orderNumber,
            customer: order.customer,
            status: "PENDING",
            lastExcerpt: messages.at(-1).bodyText,
            lastMessageAt: new Date().toISOString(),
            unreadCount: 1,
          },
        ],
        nextCursor: null,
      });
    if (pathname.endsWith("/messages/read")) return send({ saved: true });
    if (pathname.endsWith("/messages") && req.method() === "POST") {
      const data = req.postDataJSON();
      const message = {
        _id: `message-${messages.length + 1}`,
        sequence: messages.length + 1,
        bodyText: data.bodyText,
        senderKind: "STAFF",
        senderName: "Owner",
        direction: "OUTBOUND",
        deliveryState: "QUEUED",
        createdAt: new Date().toISOString(),
      };
      messages.push(message);
      return send(message, 202);
    }
    if (pathname.endsWith("/messages"))
      return send({ configured: true, order, items: messages, nextCursor: null });
    if (pathname === "/api/orders/order-a") return send(order);
    if (pathname === "/api/orders") return send({ items: [order], pendingCount: 1 });
    return send({ items: [], templates: [] });
  });
  await page.goto(`${base}/employees`);
  await page.getByRole("button", { name: "Set temporary MPIN" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("spinbutton").count(), 6);
  for (const digit of "048297")
    await dialog.getByRole("button", { name: digit, exact: true }).click();
  const use = dialog.getByRole("button", { name: "Use MPIN" });
  await use.scrollIntoViewIfNeeded();
  const box = await use.boundingBox();
  assert(box && box.y + box.height <= viewport.height);
  const mpinAxe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  assert.deepEqual(
    mpinAxe.violations.map((item) => item.id),
    [],
  );
  await page.screenshot({ path: `${output}/mpin-${viewport.width}.png` });
  await use.click();
  await page.getByRole("button", { name: "Set temporary MPIN" }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto(`${base}/landing-page`);
  await page.getByRole("heading", { name: "Landing Management", exact: true }).waitFor();
  await page.getByRole("button", { name: "View Statistics" }).click();
  await page.getByText("Unique visitors", { exact: true }).waitFor();
  await page
    .getByText("Unique visitors", { exact: true })
    .locator("..")
    .getByText("7", { exact: true })
    .waitFor();
  const statsAxe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  if (statsAxe.violations.length)
    console.log(
      JSON.stringify(
        statsAxe.violations.map(({ id, nodes }) => ({
          id,
          nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
        })),
      ),
    );
  assert.deepEqual(
    statsAxe.violations.map((item) => item.id),
    [],
  );
  await page.screenshot({ path: `${output}/statistics-${viewport.width}.png` });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto(`${base}/orders`);
  await page.getByRole("button", { name: "Messages", exact: true }).first().click();
  await page.getByText("Can I collect my order tomorrow morning?", { exact: true }).waitFor();
  await page
    .getByRole("textbox", { name: "Email message" })
    .fill(`Your order will be ready tomorrow (${viewport.width}).`);
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .locator("article")
    .getByText(`Your order will be ready tomorrow (${viewport.width}).`, { exact: true })
    .waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false);
  const inboxAxe = await new AxeBuilder({ page })
    .include('section[aria-label="Order email inbox"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  if (inboxAxe.violations.length)
    console.log(
      JSON.stringify(
        inboxAxe.violations.map(({ id, nodes }) => ({
          id,
          nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
        })),
      ),
    );
  assert.deepEqual(
    inboxAxe.violations.map((item) => item.id),
    [],
  );
  await page.screenshot({ path: `${output}/inbox-${viewport.width}.png` });
  results.push({
    viewport,
    mpinA11yViolations: mpinAxe.violations.length,
    statisticsA11yViolations: statsAxe.violations.length,
    inboxA11yViolations: inboxAxe.violations.length,
    inboxOverflow: overflow,
    sendAndPersistence: true,
  });
  await context.close();
}
assert.deepEqual(errors, []);
await writeFile(
  `${output}/results.json`,
  JSON.stringify(
    {
      results,
      errors,
      sendRequests: requests.filter(
        (req) => req.method === "POST" && req.path.endsWith("/messages"),
      ).length,
      evidenceType: "Browser UI with mocked HTTP; no provider delivery",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results));
await browser.close();
