import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { installQaRoutes, makeQaState, qaResponse, qaTemplateIds } from "./landing-mobile-qa-fixtures.mjs";

const origin = process.env.LANDING_TEST_URL ?? "http://127.0.0.1:4187";
const output = new URL("../../design/catalog-my-day-2026-11-02/verification/", import.meta.url);
await mkdir(output, { recursive: true });
const managerOnly = process.env.MY_DAY_SCOPE === "manager";
const previous = managerOnly ? JSON.parse(await readFile(new URL("browser-results.json", output), "utf8")) : null;
const results = previous ? previous.results.filter(result => result.status === "PASS" && result.scenario !== "catalog-row-shortcut-and-save") : [];
const errors = [];
const axe = await readFile(new URL(import.meta.resolve("axe-core/axe.min.js")), "utf8");
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser;
  try { browser = await engine.launch({ headless: true, ...(name === "chromium" ? { channel: "chrome" } : {}) }); }
  catch (error) { results.push({ browser: name, status: "UNAVAILABLE", error: error.message }); continue; }
  try {
    for (const template of managerOnly ? [] : qaTemplateIds) for (const width of [320, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block" });
      const state = makeQaState(template, { goal: "SHOP" });
      await installQaRoutes(context, state, origin);
      const start = Date.now();
      const campaign = { id: "campaign", revision: 1, heading: "Weekend harvest", description: "Our current product selection", startsAt: new Date(start - 60_000).toISOString(), endsAt: new Date(start + 3600_000).toISOString(), productKeys: state.catalog.slice(0, 2).map(p => p.key) };
      let enabled = true, fail = false, notFound = false;
      await context.route("**/public/landing-pages/*", route => route.fulfill(notFound ? { status: 404, json: { message: "Page unpublished" } } : fail ? { status: 503, json: { message: "Fixture unavailable" } } : { json: { ...qaResponse(state), myDay: enabled ? campaign : null, myDayFrequency: { timezone: "Asia/Manila", localDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()) } } }));
      const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
      try {
        await page.clock.install();
        await page.goto(`${origin}/site/${state.slug}`);
        await expect(page.getByRole("button", { name: "My Day", exact: true })).toBeVisible();
        await page.clock.fastForward(2500);
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: "Weekend harvest" })).toBeVisible();
        assert.equal(await dialog.count(), 1);
        await expect(dialog.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
        await dialog.getByRole("button", { name: "Next", exact: true }).click();
        await expect(dialog.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
        await expect.poll(() => dialog.locator("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        await page.screenshot({ path: new URL(`${name}-${template}-${width}.png`, output).pathname.replace(/^\/(C:)/, "$1"), animations: "disabled" });
        const geometry = await dialog.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, scroll: el.scrollWidth, width: el.clientWidth }));
        assert(geometry.left >= 0 && geometry.right <= width && geometry.scroll <= geometry.width + 1, JSON.stringify(geometry));
        await page.addScriptTag({ content: axe });
        const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('[role="dialog"]'), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.failureSummary) })));
        assert.deepEqual(violations, []);
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
        await expect(page.getByRole("button", { name: "My Day", exact: true })).toBeFocused();
        await page.reload(); await expect(page.getByRole("button", { name: "My Day", exact: true })).toBeVisible(); await page.clock.fastForward(2500); await expect(dialog).toHaveCount(0);
        await page.getByRole("button", { name: "My Day", exact: true }).click();
        await dialog.getByRole("button", { name: "Next", exact: true }).click();
        await dialog.getByRole("button", { name: "Choose product / Add to cart" }).click();
        await expect(page.getByRole("dialog").getByRole("heading", { name: /Choose .* options/ })).toBeVisible();
        assert.equal(await page.getByRole("dialog").count(), 1);
        await page.keyboard.press("Escape");
        if (template === qaTemplateIds[0] && width === 320) {
          enabled = false; await page.reload(); await expect(page.getByRole("button", { name: "My Day", exact: true })).toHaveCount(0);
          enabled = true; campaign.endsAt = new Date(Date.now() + 3500).toISOString();
          await page.reload(); await page.getByRole("button", { name: "My Day", exact: true }).click(); fail = true;
          await page.clock.fastForward(5000); await expect(dialog).toHaveCount(0); await expect(page.getByRole("button", { name: "My Day", exact: true })).toHaveCount(0);
          fail = false; campaign.endsAt = new Date(Date.now() + 3600_000).toISOString();
          await page.reload(); await page.getByRole("button", { name: "My Day", exact: true }).click();
          notFound = true; const response = page.waitForResponse(r => r.status() === 404 && r.url().includes("/public/landing-pages/"));
          await page.clock.fastForward(30_100); await response;
          await expect(dialog).toHaveCount(0); await expect(page.getByRole("button", { name: "My Day", exact: true })).toHaveCount(0);
        }
        results.push({ browser: name, version: browser.version(), template, width, status: "PASS", geometry, axe: violations });
      } catch (error) { results.push({ browser: name, template, width, status: "FAIL", error: error.stack }); }
      finally { await context.close(); }
      console.log(`${name} ${template} ${width}: ${results.at(-1).status}`);
    }
    for (const goal of managerOnly ? [] : ["CATALOG", "INQUIRY", "LEGACY"]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      const state = makeQaState("everyday-boutique", { goal: goal === "LEGACY" ? "SHOP" : goal });
      if (goal === "LEGACY") state.variant.schemaVersion = 1;
      const contactSection = state.variant.sections.find(s => s.components.some(c => c.type === "CONTACT"));
      if (contactSection) contactSection.components.find(c => c.type === "CONTACT").content.phone = "+639171234567";
      await installQaRoutes(context, state, origin);
      const campaign = { id: "goal", revision: 1, heading: "Goal preview", description: "A single product", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(), productKeys: [state.catalog[0].key] };
      await context.route("**/public/landing-pages/*", route => route.fulfill({ json: { ...qaResponse(state), myDay: campaign, myDayFrequency: { timezone: "Asia/Manila", localDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()) } } }));
      const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
      try {
        await page.clock.install(); await page.goto(`${origin}/site/${state.slug}`); await expect(page.getByRole("button", { name: "My Day", exact: true })).toBeVisible(); await page.clock.fastForward(2500);
        await expect(page.getByRole("dialog")).toHaveCount(1);
        await expect(page.getByRole("dialog").getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
        if (goal === "CATALOG") {
          await page.getByRole("button", { name: "View product", exact: true }).click();
          await expect(page.getByRole("dialog").getByRole("heading", { name: state.catalog[0].name })).toBeVisible();
          assert.equal(await page.getByRole("dialog").count(), 1);
          await expect(page.getByRole("dialog").getByRole("button", { name: "Add to cart", exact: true })).toHaveCount(0);
        } else if (goal === "INQUIRY") {
          await page.getByRole("button", { name: "Ask about this product", exact: true }).click();
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await expect(page.locator(`[id="${contactSection.id}"]`).first()).toBeFocused();
        }
        results.push({ browser: name, scenario: `goal-${goal}`, status: "PASS" });
      } catch (error) { results.push({ browser: name, scenario: `goal-${goal}`, status: "FAIL", error: error.stack }); }
      finally { await context.close(); }
    }
    // Exercise the management form through the real catalog page, with isolated API fixtures.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const state = makeQaState(); await installQaRoutes(context, state, origin);
    const owner = { id: "owner", name: "Fixture owner", email: "owner@example.test", role: 0, status: "ACTIVE", isApproved: true, emailVerified: true, isHighestRole: true, businessName: "Fixture" };
    await context.addInitScript(user => { localStorage.setItem("miss-v-token", "fixture"); localStorage.setItem("miss-v-user", JSON.stringify(user)); }, owner);
    let saved;
    await context.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname, method = route.request().method();
      if (path === "/api/auth/me") return route.fulfill({ json: { owner } });
      if (path === "/api/orders") return route.fulfill({ json: { items: [] } });
      if (path === "/api/catalog/products") return route.fulfill({ json: { timezone: "Asia/Manila", serverTime: new Date().toISOString(), items: state.catalog.slice(0, 3).map((p, i) => ({ ...p, _id: p.sourceId, basePrice: p.price, isActive: true, isOrderable: true, availableQuantity: 10, revision: 1, productCode: `P${i}` })) } });
      if (path === "/api/catalog/my-day" && method === "GET") return route.fulfill({ json: { items: saved ? [{ ...saved, _id: "saved", revision: 1, status: "Active", diagnostics: [], pageName: "Fixture shop" }] : [], total: saved ? 1 : 0, pages: [{ _id: "507f1f77bcf86cd799439010", name: "Fixture shop", slug: "shop", isPublished: true }], timezone: "Asia/Manila", serverTime: new Date().toISOString() } });
      if (path === "/api/catalog/my-day" && method === "POST") { saved = route.request().postDataJSON(); saved.startsAt = new Date().toISOString(); return route.fulfill({ status: 201, json: saved }); }
      return route.fallback();
    });
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(`${origin}/catalog`);
      await page.getByRole("button", { name: "Schedule in My Day", exact: true }).first().click();
      await expect(page.getByRole("heading", { name: "Schedule My Day", exact: true })).toBeVisible();
      await page.getByLabel("Campaign name", { exact: true }).fill("Weekend harvest");
      await page.getByRole("combobox", { name: /^Landing page/ }).selectOption("507f1f77bcf86cd799439010");
      await page.screenshot({ path: new URL(`${name}-manager-390.png`, output).pathname.replace(/^\/(C:)/, "$1"), animations: "disabled" });
      await page.getByRole("button", { name: "Save and enable", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Weekend harvest · Active" })).toBeVisible();
      assert.equal(saved.productIds.length, 1); assert.equal(saved.isEnabled, true); assert.equal(saved.startNow, true);
      results.push({ browser: name, scenario: "catalog-row-shortcut-and-save", status: "PASS" });
    } catch (error) { results.push({ browser: name, scenario: "catalog-row-shortcut-and-save", status: "FAIL", error: error.stack }); }
    finally { await context.close(); }
  } finally { await browser.close(); }
}
await writeFile(new URL("browser-results.json", output), JSON.stringify({ timestamp: new Date().toISOString(), results, pageErrors: errors }, null, 2));
console.log(JSON.stringify({ pass: results.filter(r => r.status === "PASS").length, failures: results.filter(r => r.status !== "PASS"), pageErrors: errors }, null, 2));
if (results.some(r => r.status !== "PASS") || errors.length) process.exitCode = 1;
