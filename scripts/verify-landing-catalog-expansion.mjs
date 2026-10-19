import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

// Uses only the disposable backend fixture server; refuses any other environment.
const base = process.env.LANDING_TEST_URL ?? "http://127.0.0.1:4186";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route("**/*", (route) => {
  const request = route.request();
  // Prevent a local build with a different API configuration from touching external services.
  if (
    ["fetch", "xhr"].includes(request.resourceType()) &&
    new URL(request.url()).origin !== new URL(base).origin
  )
    return route.abort();
  return route.continue();
});
const page = await context.newPage();
const output = "test-results/landing-catalog-expansion";
await mkdir(output, { recursive: true });
const errors = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(15000);
try {
  const marker = await context.request.get(`${base}/api/__test/fixture`);
  assert.equal((await marker.json()).kind, "farm-disposable-fixture-v1");
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: {
      method: "EMAIL_PASSWORD",
      email: "owner@example.test",
      password: "Test-owner-password-2026",
    },
  });
  assert.equal(login.status(), 200);
  const { token } = await login.json();
  await context.addInitScript((value) => localStorage.setItem("miss-v-token", value), token);
  const request = async (path) => {
    const response = await context.request.get(`${base}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status(), 200);
    return response.json();
  };
  const suffix = Date.now().toString(36);
  const slug = `browser-farm-${suffix}`,
    cloneSlug = `browser-holiday-${suffix}`;
  await page.goto(`${base}/landing-page`);
  await page.getByRole("heading", { name: "Landing pages", exact: true }).waitFor();
  await page.getByRole("button", { name: "Create landing page", exact: true }).click();
  await page.getByLabel("Page name", { exact: true }).fill("Browser farm");
  await page.getByLabel("Subdomain", { exact: true }).fill(slug);
  await page.getByText("Available", { exact: true }).waitFor();
  const createdResponse = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/landing-page/pages"),
  );
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  const created = await (await createdResponse).json();
  assert.ok(created.page._id);
  await page.getByLabel("Variant", { exact: true }).waitFor();
  const catalog = page
    .locator(".lb-tree-blocks .lb-tree-label")
    .filter({ hasText: "Catalog" })
    .first();
  await catalog.click();
  await page
    .getByLabel("Category selection mode", { exact: true })
    .selectOption("SELECTED_CATEGORIES");
  await page.getByRole("checkbox", { name: /Farm products — products/ }).check();
  await page.locator(".lb-save-status").filter({ hasText: "Draft saved" }).waitFor();
  const doc = await request(`/landing-page/pages/${created.page._id}`);
  const binding = doc.variants[0].sections
    .flatMap((s) => s.components)
    .find((b) => b.type === "CATALOG").content.categoryBinding;
  assert.equal(binding.mode, "SELECTED_CATEGORIES");
  assert.equal(binding.categoryIds.length, 1);
  checks.push("Created page and autosaved category selection through real API");
  await page.screenshot({ path: `${output}/desktop-category-editor.png` });

  await page.getByRole("button", { name: "Save template", exact: true }).click();
  await page.getByLabel("Template name", { exact: true }).fill(`Reusable ${suffix}`);
  await page.getByRole("button", { name: "Save new template", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const templatesBefore = await request("/landing-page/saved-templates");
  const template = templatesBefore.items.find((t) => t.name === `Reusable ${suffix}`);
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  assert.equal(await page.getByLabel("Template name", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Update template", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const templatesAfter = await request("/landing-page/saved-templates");
  assert.equal(templatesAfter.items.length, templatesBefore.items.length);
  assert.equal(
    templatesAfter.items.find((t) => t._id === template._id).revision,
    template.revision + 1,
  );
  checks.push("Overwrote saved template under the same ID and name, without a rename prompt");

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByText("Live", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Publish as another page", exact: true }).click();
  await page.getByLabel("Page name", { exact: true }).fill("Browser holiday");
  await page.getByLabel("Subdomain", { exact: true }).fill(slug);
  await page.getByText("This subdomain is already taken", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Create and publish", exact: true }).isDisabled(),
    true,
  );
  await page.getByLabel("Subdomain", { exact: true }).fill(cloneSlug);
  await page.getByText("Available", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Create and publish", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByLabel("Variant", { exact: true }).waitFor();
  const pages = await request("/landing-page/pages");
  assert.equal(pages.items.find((p) => p.slug === slug).isPublished, true);
  assert.equal(pages.items.find((p) => p.slug === cloneSlug).isPublished, true);
  checks.push("Published two pages and blocked a taken subdomain in the UI");

  await page.goto(`${base}/catalog`);
  await page.getByRole("button", { name: "Schedule availability", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Always available", exact: true }).uncheck();
  await dialog.getByLabel("Schedule mode", { exact: true }).selectOption("CUSTOM_DATES");
  await dialog.getByLabel("Calendar month and year", { exact: true }).fill("2040-01");
  await dialog.getByRole("button", { name: "2040-01-01", exact: true }).click();
  await page.screenshot({ path: `${output}/desktop-calendar.png` });
  const desktopAxe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.equal(
    desktopAxe.violations.length,
    0,
    JSON.stringify(
      desktopAxe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile-calendar.png` });
  const save = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && r.url().endsWith("/availability"),
  );
  await dialog.getByRole("button", { name: "Save availability", exact: true }).click();
  const scheduled = await (await save).json();
  assert.equal(scheduled.availabilityStatus, "SCHEDULED");
  await dialog.waitFor({ state: "hidden" });
  const publicData = await (
    await context.request.get(`${base}/api/public/landing-pages/${slug}`)
  ).json();
  assert.equal(
    publicData.catalogItems.some((item) => item.sourceId === scheduled._id),
    false,
  );
  checks.push(
    "Saved custom calendar dates on mobile and verified schedule filtering on published page",
  );

  await page.goto(`${base}/landing-page`);
  await page.getByRole("heading", { name: "Landing pages", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Browser farm", exact: true }).first().waitFor();
  await page.screenshot({ path: `${output}/mobile-page-list.png` });
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify(
      {
        passed: true,
        checks,
        pageErrors: errors,
        desktopDialogAccessibilityViolations: desktopAxe.violations.length,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks, pageErrors: errors.length }));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(
    `${output}/failure.txt`,
    `${error.stack}\n${(
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(0, 12000)}`,
  );
  throw error;
} finally {
  await browser.close();
}
