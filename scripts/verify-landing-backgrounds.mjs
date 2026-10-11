import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import {
  createLandingPreset,
  landingTemplates,
} from "../../farm-management-backend/dist/services/landing-presets.js";

const url = process.env.LANDING_TEST_URL ?? "http://127.0.0.1:4181";
let published = createLandingPreset(
  "architectural-escape",
  undefined,
  "INQUIRY",
  { businessName: "Scene verification" },
  [],
);
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const messages = [];
page.on("console", (msg) => {
  if (["warning", "error"].includes(msg.type())) messages.push(msg.text());
});
page.on("pageerror", (e) => messages.push(e.message));
page.on("requestfailed", (r) => messages.push(`${r.url()}: ${r.failure()?.errorText}`));
await context.route("**/*", (route) => {
  const r = route.request();
  if (new URL(r.url()).pathname.endsWith("/public/landing-pages/scene-test"))
    return route.fulfill({
      json: {
        slug: "scene-test",
        siteTitle: "Scene test",
        seoDescription: "",
        variant: published,
        catalogItems: [],
        menuItems: [],
        serverTime: new Date().toISOString(),
      },
    });
  return r.url().startsWith(url) ? route.continue() : route.abort();
});
const report = [];
await mkdir("test-results/landing-v2", { recursive: true });
try {
  for (const t of landingTemplates) {
    published = createLandingPreset(
      t.id,
      undefined,
      "INQUIRY",
      { businessName: "Scene verification" },
      [],
    );
    await page.goto(`${url}/site/scene-test`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(
      () => document.querySelector(".lp-background-canvas")?.style.opacity === "1",
      undefined,
      { timeout: 15000 },
    );
    const state = await page.evaluate(() => ({
      fine: matchMedia("(pointer:fine)").matches,
      eligible: matchMedia("(min-width:1024px) and (pointer:fine)").matches,
      reduced: matchMedia("(prefers-reduced-motion:reduce)").matches,
      saveData: navigator.connection?.saveData,
      scrollY,
      canvas: document.querySelectorAll(".lp-background canvas").length,
      loaded: document.querySelector(".lp-background-canvas")?.style.opacity,
      bounds: document.querySelector(".lp-background")?.getBoundingClientRect().toJSON(),
    }));
    report.push({ template: t.id, ...state });
    assert.equal(state.canvas, 1, `${t.id} must use one live canvas`);
    assert.equal(state.loaded, "1", `${t.id} must load its scene`);
    await page.screenshot({ path: `test-results/landing-v2/${t.id}-webgl.png` });
  }
} finally {
  await writeFile(
    "test-results/landing-v2/background-verification.json",
    JSON.stringify({ report, messages }, null, 2),
  );
  await browser.close();
}
console.log(JSON.stringify({ report, messages }, null, 2));
