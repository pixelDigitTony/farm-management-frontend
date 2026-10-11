import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import {
  createLandingPreset,
  landingTemplates,
} from "../../farm-management-backend/dist/services/landing-presets.js";

const url = process.env.LANDING_TEST_URL ?? "http://127.0.0.1:4181";
const output = "test-results/landing-v2";
const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
const publicDependencies = new Set();
function visit(key) {
  if (publicDependencies.has(key)) return;
  publicDependencies.add(key);
  for (const dependency of manifest[key]?.imports ?? []) visit(dependency);
}
visit("index.html");
visit("src/pages/PublicLandingPage.tsx");
assert(
  ![...publicDependencies].some((key) =>
    /LandingPageBuilderPage|landing-page\/editor\/|background-engine|ImageUpload|dnd-kit/.test(key),
  ),
  "Public startup must exclude editor and optional 3D code",
);
const engine = manifest["src/components/landing-page/background-engine.ts"];
const engineBytes = await readFile(path.join("dist", engine.file));
const pack = JSON.parse(await readFile("src/lib/landing-page/assets.json", "utf8"));
const scenes = await Promise.all(
  pack.scenes.map(async (scene) => {
    const bytes = (await stat(path.join("public", scene.glb.replace(/^\//, "")))).size;
    assert(bytes < 2 * 1024 * 1024, `${scene.id} exceeds the scene budget`);
    return { id: scene.id, bytes };
  }),
);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const imagery = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: width === 390 ? 2 : 1,
      reducedMotion: "reduce",
    });
    let document;
    await context.route("**/*", (route) => {
      const request = route.request();
      if (new URL(request.url()).pathname.endsWith("/public/landing-pages/budget-test"))
        return route.fulfill({
          json: {
            slug: "budget-test",
            siteTitle: "Asset budget verification",
            seoDescription: "",
            variant: document,
            catalogItems: [],
            menuItems: [],
            serverTime: new Date().toISOString(),
          },
        });
      return request.url().startsWith(url) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const template of landingTemplates) {
      document = createLandingPreset(
        template.id,
        undefined,
        "INQUIRY",
        { businessName: "Asset budget verification" },
        [],
      );
      await page.goto(`${url}/site/budget-test`);
      await page.locator(".lp-storefront").waitFor();
      const files = await page.evaluate(async () => {
        const images = [...document.querySelectorAll(".lp-storefront img")].filter((image) => {
          const box = image.getBoundingClientRect();
          return (
            box.width &&
            box.height &&
            box.bottom > 0 &&
            box.top < innerHeight &&
            box.right > 0 &&
            box.left < innerWidth
          );
        });
        await Promise.all(images.map((image) => image.decode().catch(() => {})));
        return [...new Set(images.map((image) => new URL(image.currentSrc || image.src).pathname))];
      });
      const assets = await Promise.all(
        files
          .filter((file) => file.startsWith("/landing-assets/"))
          .map(async (file) => ({
            file,
            bytes: (await stat(path.resolve("public", file.slice(1)))).size,
          })),
      );
      const bytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
      const largestImageBytes = Math.max(0, ...assets.map((asset) => asset.bytes));
      const largestImageTarget = (width === 390 ? 300 : 500) * 1024;
      assert(
        bytes <= 800 * 1024,
        `${template.id} first-screen imagery exceeds 800 KiB at ${width}px`,
      );
      assert(
        largestImageBytes <= largestImageTarget,
        `${template.id} image exceeds ${largestImageTarget / 1024} KiB at ${width}px`,
      );
      imagery.push({
        template: template.id,
        width,
        deviceScaleFactor: width === 390 ? 2 : 1,
        bytes,
        largestImageBytes,
        assets,
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
const report = {
  scope:
    "Curated default first-screen images at opening scroll position, mobile DPR 2/desktop DPR 1 with static fallback. Empty merchant catalog. File bytes, not network timing or field Web Vitals.",
  publicStartupExcludesEditorAnd3D: true,
  engine: {
    file: engine.file,
    rawBytes: engineBytes.length,
    gzipBytes: gzipSync(engineBytes).length,
  },
  decoder: await Promise.all(
    ["draco_wasm_wrapper.js", "draco_decoder.wasm"].map(async (file) => ({
      file,
      bytes: (await stat(`public/landing-assets/draco/${file}`)).size,
    })),
  ),
  scenes,
  imagery,
};
await mkdir(output, { recursive: true });
await writeFile(`${output}/budgets.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      publicStartupExcludesEditorAnd3D: true,
      engine: report.engine,
      scenes,
      imagery: imagery.map(({ assets, ...summary }) => summary),
    },
    null,
    2,
  ),
);
