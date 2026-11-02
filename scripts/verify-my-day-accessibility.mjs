import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { installQaRoutes, makeQaState, qaResponse } from "./landing-mobile-qa-fixtures.mjs";

const origin = process.env.LANDING_TEST_URL ?? "http://127.0.0.1:4187";
const output = new URL("../../design/catalog-my-day-2026-11-02/verification/", import.meta.url);
const results = [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch({ headless: true, ...(name === "chromium" ? { channel: "chrome" } : {}) });
  try {
    for (const width of [390, 768]) {
      const context = await browser.newContext({ viewport: { width, height: 480 }, reducedMotion: "reduce" });
      const state = makeQaState(); await installQaRoutes(context, state, origin);
      await context.route("**/public/landing-pages/*", route => route.fulfill({ json: { ...qaResponse(state), myDay: { id: "accessibility", revision: 1, heading: "Our current featured products", description: "A readable product story", startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(), productKeys: state.catalog.slice(0, 2).map(item => item.key) }, myDayFrequency: { timezone: "Asia/Manila", localDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()) } } }));
      const page = await context.newPage();
      try {
        await page.clock.install(); await page.goto(`${origin}/site/${state.slug}`);
        await expect(page.getByRole("button", { name: "My Day", exact: true })).toBeVisible();
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
        await page.clock.fastForward(2500);
        const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
        const bounds = await dialog.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, height: el.getBoundingClientRect().height, width: el.clientWidth, scrollWidth: el.scrollWidth }));
        assert(bounds.left >= 0 && bounds.right <= width && bounds.height <= 480 && bounds.scrollWidth <= bounds.width + 1, JSON.stringify(bounds));
        for (let tab = 0; tab < 8; tab++) { await page.keyboard.press("Tab"); assert(await dialog.evaluate(el => el.contains(document.activeElement))); }
        await dialog.getByRole("button", { name: "Next", exact: true }).click();
        await expect(dialog.getByText("2 of 2")).toBeVisible();
        await dialog.evaluate(el => { el.scrollTop = 0; });
        await page.screenshot({ path: new URL(`${name}-text-200-${width}.png`, output).pathname.replace(/^\/(C:)/, "$1"), animations: "disabled" });
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
        results.push({ browser: name, version: browser.version(), width, height: 480, textScale: 2, status: "PASS", bounds });
      } catch (error) { results.push({ browser: name, width, status: "FAIL", error: error.stack }); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
await writeFile(new URL("accessibility-results.json", output), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.status !== "PASS")) process.exitCode = 1;
