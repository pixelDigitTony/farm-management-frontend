import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { installQaRoutes, makeQaState, qaTemplateIds } from "./landing-mobile-qa-fixtures.mjs";

const origin = process.env.LANDING_TEST_URL ?? "http://localhost:5173";
const output = new URL("../../design/product-card-actions-2026-11-03/verification/", import.meta.url);
await mkdir(output, { recursive: true });
const selectedTemplate = process.env.PRODUCT_ACTIONS_TEMPLATE;
const results = selectedTemplate ? JSON.parse(await readFile(new URL("results.json", output), "utf8")).filter(result => result.status === "PASS" && result.template !== selectedTemplate) : [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch({ headless: true, ...(name === "chromium" ? { channel: "chrome" } : {}) });
  try {
    for (const template of qaTemplateIds.filter(id => !selectedTemplate || id === selectedTemplate)) for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const state = makeQaState(template, { goal: "SHOP" });
      if (!state.variant.sections.some(section => section.components.some(block => block.type === "CATALOG"))) {
        // Architectural Escape has no product section by default. Exercise an
        // owner-added catalog without changing that template's defaults.
        const section = makeQaState("bold-market", { goal: "SHOP" }).variant.sections.find(section => section.components.some(block => block.type === "CATALOG"));
        assert(section); state.variant.sections.push(structuredClone(section));
      }
      // Existing published pages can still carry every old visibility flag.
      for (const block of state.variant.sections.flatMap(section => section.components)) if (block.type === "CATALOG") Object.assign(block.appearance, { showShopNow: true, showAddToCart: true, showQuickView: true });
      await installQaRoutes(context, state, origin);
      const page = await context.newPage();
      try {
        await page.goto(`${origin}/site/${state.slug}`);
        const cards = page.locator(".lp-product"); await expect(cards.first()).toBeVisible();
        const counts = await cards.evaluateAll(elements => elements.map(element => element.querySelectorAll("button").length));
        assert(counts.length > 1 && counts.every(count => count === 1));
        await expect(page.getByRole("button", { name: "Shop now", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Quick view", exact: true })).toHaveCount(0);
        const variantCard = cards.nth(1), opener = variantCard.getByRole("button", { name: "Choose options", exact: true });
        await opener.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("heading", { name: state.catalog[1].name })).toBeVisible();
        assert.equal(state.orders.length, 0);
        await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
        await opener.click();
        await dialog.locator(".lp-option:not([disabled])").first().click();
        await dialog.getByRole("button", { name: "Add and review cart", exact: true }).click();
        await expect(page.getByRole("dialog").getByRole("heading", { name: "Your cart", exact: true })).toBeVisible();
        assert.equal(await page.getByRole("dialog").count(), 1);
        await page.keyboard.press("Escape");
        await cards.first().getByRole("button", { name: "Add to cart", exact: true }).click();
        await expect(page.getByRole("dialog").getByRole("heading", { name: "Your cart", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        assert.equal(state.orders.length, 0);
        if (template === "everyday-boutique") await cards.first().screenshot({ path: fileURLToPath(new URL(`${name}-${width}-card.png`, output)) });
        results.push({ browser: name, version: browser.version(), template, width, status: "PASS", productCount: counts.length });
      } catch (error) { results.push({ browser: name, template, width, status: "FAIL", error: error.stack }); }
      finally { await context.close(); }
    }
    if (name === "chromium" && !selectedTemplate) {
      const page = await browser.newPage({ viewport: { width: 1750, height: 1000 } });
      try {
        await page.goto(`${origin}/site/gym-wear`, { waitUntil: "networkidle" });
        if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
        const cards = page.locator(".lp-product"); await expect(cards.first()).toBeVisible();
        const labels = await cards.evaluateAll(elements => elements.map(element => [...element.querySelectorAll("button")].map(button => button.textContent.trim())));
        assert(labels.length > 0 && labels.every(actions => actions.length === 1 && actions[0] === "Choose options"));
        await page.locator(".lp-catalog").first().screenshot({ path: fileURLToPath(new URL("gym-wear-desktop.png", output)) });
        await cards.first().getByRole("button", { name: "Choose options", exact: true }).click();
        await expect(page.getByRole("dialog").getByText("Select an option", { exact: true })).toBeVisible();
        results.push({ browser: name, scenario: "actual-local-gym-wear", status: "PASS", labels });
      } catch (error) { results.push({ browser: name, scenario: "actual-local-gym-wear", status: "FAIL", error: error.stack }); }
      finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
await writeFile(new URL("results.json", output), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ passed: results.filter(result => result.status === "PASS").length, failures: results.filter(result => result.status !== "PASS") }, null, 2));
if (results.some(result => result.status !== "PASS")) process.exitCode = 1;
