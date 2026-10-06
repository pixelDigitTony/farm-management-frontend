import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const url = process.env.LANDING_TEST_URL ?? "http://127.0.0.1:4181";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const theme = {
  primaryColor: "#be185d",
  backgroundColor: "#fff7fb",
  surfaceColor: "#ffffff",
  textColor: "#292524",
  fontStyle: "CLASSIC",
  buttonStyle: "ROUNDED",
};
const commerce = {
  orderingEnabled: true,
  cartButtonLabel: "Cart",
  cartButtonPosition: "BOTTOM_RIGHT",
  fulfillmentMethods: ["PICKUP", "DELIVERY"],
  paymentMethods: ["PAY_ON_PICKUP", "CASH_ON_DELIVERY"],
  checkoutInstructions: "Test instructions",
  minimumOrder: 0,
  deliveryFee: 0,
};
const sections = [
  {
    id: "section",
    name: "Main section",
    enabled: true,
    backgroundColor: "",
    textColor: "",
    contentWidth: "WIDE",
    padding: "MEDIUM",
    gap: "MEDIUM",
    components: [
      {
        id: "text",
        type: "TEXT",
        enabled: true,
        width: "FULL",
        content: { heading: "Original story", body: "Original body", alignment: "LEFT" },
      },
    ],
  },
];
let variant = { _id: "variant", name: "Main", theme, commerce, sections };
let resetCount = 0;
const requests = [];
let failNextSave = false;
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => localStorage.setItem("miss-v-token", "fixture-token"));
await page.route("**/*", async (route) => {
  const request = route.request();
  if (!["fetch", "xhr"].includes(request.resourceType())) {
    return request.url().startsWith(url) ? route.continue() : route.abort();
  }
  const path = new URL(request.url()).pathname;
  const send = (data, status = 200) => route.fulfill({ status, json: data });
  if (path.endsWith("/auth/me"))
    return send({
      owner: {
        id: "owner",
        name: "Test Owner",
        email: "owner@example.test",
        phone: "",
        role: 0,
        roleName: "Owner",
        status: "ACTIVE",
        isApproved: true,
        emailVerified: true,
        isHighestRole: true,
        businessName: "Test Farm",
      },
    });
  if (path.endsWith("/orders")) return send({ pendingCount: 0 });
  if (path.endsWith("/landing-page"))
    return send({
      page: {
        _id: "page",
        slug: "test-farm",
        siteTitle: "Test Farm",
        seoDescription: "",
        isPublished: false,
      },
      variants: [variant],
      menuItems: [],
      catalogItems: [],
    });
  if (path.endsWith("/variants/variant/reset")) {
    resetCount++;
    variant = { ...variant, theme, commerce, sections: structuredClone(sections) };
    return send(variant);
  }
  if (path.endsWith("/variants/variant") && request.method() === "PATCH") {
    const update = request.postDataJSON();
    requests.push(update);
    if (failNextSave) {
      failNextSave = false;
      return send({ message: "Temporary save failure" }, 503);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    variant = { ...variant, ...update };
    return send(variant);
  }
  if (request.url().startsWith(url)) return route.continue();
  return route.abort();
});

async function rename(name) {
  page.once("dialog", (dialog) => dialog.accept(name));
  await page.getByRole("button", { name: "Rename", exact: true }).click();
}
async function waitForSaved() {
  await page.getByRole("status").filter({ hasText: "Draft saved automatically" }).waitFor();
}
try {
  await page.goto(`${url}/landing-page`);
  await page.getByRole("heading", { name: "Landing page builder" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save draft", exact: true }).count(), 0);
  const buttonOrder = await page.getByRole("button").allTextContents();
  const renameIndex = buttonOrder.indexOf(" Rename");
  assert.equal(buttonOrder[renameIndex + 1], " Reset");
  assert.equal(buttonOrder[renameIndex + 2], " Delete");
  await rename("First name");
  await page.waitForRequest((request) => request.method() === "PATCH");
  await rename("Latest name");
  await waitForSaved();
  assert.equal(variant.name, "Latest name");
  assert.deepEqual(
    requests.map((request) => request.name),
    ["First name", "Latest name"],
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await waitForSaved();
  assert.equal(variant.name, "First name");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await waitForSaved();
  assert.equal(variant.name, "Latest name");

  await page.locator("#builder-component-text").hover();
  await page.getByRole("button", { name: "Edit text content", exact: true }).click();
  await page.getByRole("textbox", { name: "Heading", exact: true }).fill("Edited story");
  await page.getByRole("button", { name: "Apply changes", exact: true }).click();
  await waitForSaved();
  assert.equal(variant.sections[0].components[0].content.heading, "Edited story");
  await page.reload();
  await page.getByRole("heading", { name: "Edited story", exact: true }).waitFor();

  failNextSave = true;
  await rename("Failed rename");
  await page.getByText("Draft not saved: Temporary save failure", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await waitForSaved();
  assert.equal(variant.name, "Failed rename");

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert.match(await page.getByRole("dialog").innerText(), /Recent changes will be lost/);
  await mkdir("artifacts/landing-drafts", { recursive: true });
  await page.screenshot({ path: "artifacts/landing-drafts/desktop-reset.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(resetCount, 0);
  assert.equal(variant.sections[0].components[0].content.heading, "Edited story");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.screenshot({ path: "artifacts/landing-drafts/mobile-reset.png" });
  await page.getByRole("button", { name: "Reset variant", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(resetCount, 1);
  assert.equal(variant.name, "Failed rename");
  await page.reload();
  await page.getByRole("heading", { name: "Original story", exact: true }).waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "PASS: desktop/mobile button order, serialized autosave, undo/redo, content persistence, save retry, reset warning/cancel/confirm, reload, and no browser errors (mocked API).",
  );
} finally {
  await browser.close();
}
