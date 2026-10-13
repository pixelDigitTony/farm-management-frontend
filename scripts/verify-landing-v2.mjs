import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { safeParse } from "valibot";
import {
  createLandingPreset,
  landingTemplates,
} from "../../farm-management-backend/dist/services/landing-presets.js";
import { landingPageVariantUpdateSchema } from "../../farm-management-backend/dist/validation/landing-page.js";

const url = process.env.LANDING_TEST_URL ?? "http://127.0.0.1:4181";
const output = "test-results/landing-v2";
await mkdir(output, { recursive: true });
const catalog = [
  {
    sourceType: "PRODUCT",
    sourceId: "507f1f77bcf86cd799439011",
    name: "Everyday collection",
    category: "Essentials",
    productType: "CLOTHING",
    mediaUrls: ["/landing-assets/web/everyday-boutique/boutique-red-960.webp"],
    isAvailable: true,
    isFeatured: true,
    description: "A merchant-owned product with real choices.",
    price: 399,
    variants: [],
  },
  {
    sourceType: "PRODUCT",
    sourceId: "507f1f77bcf86cd799439012",
    name: "Choose your style",
    category: "Accessories",
    productType: "MERCHANDISE",
    mediaUrls: ["/landing-assets/web/editorial-studio/studio-bag-960.webp"],
    isAvailable: true,
    isFeatured: false,
    description: "Choose an available variant.",
    price: 600,
    variants: [
      { variantId: "small", name: "Small", attributes: [], price: 600, isAvailable: true },
      { variantId: "large", name: "Large", attributes: [], price: 650, isAvailable: false },
    ],
  },
  {
    sourceType: "PRODUCT",
    sourceId: "507f1f77bcf86cd799439013",
    name: "Unavailable item",
    category: "Essentials",
    productType: "OTHER",
    mediaUrls: ["/landing-assets/web/bold-market/market-ribs-960.webp"],
    isAvailable: false,
    isFeatured: false,
    description: "Currently unavailable.",
    price: 0,
    variants: [],
  },
].map((i) => ({ ...i, key: `${i.sourceType}:${i.sourceId}` }));
const variants = landingTemplates.map((t, i) => ({
  _id: `variant${i}`,
  createdAt: "2026-10-11T00:00:00Z",
  updatedAt: "2026-10-11T00:00:00Z",
  ...createLandingPreset(t.id, t.revision, t.goal, { businessName: "Demo merchant" }, catalog),
}));
const pageRecord = {
  _id: "page",
  slug: "demo-store",
  siteTitle: "Demo merchant",
  seoDescription: "Editable template test",
  isPublished: false,
};
let published = structuredClone(variants[0]);
let failSave = false;
let active = 0,
  maxActive = 0;
const writes = [];
let orders = 0;
let failOrder = false;
const orderBodies = [];
const axeSource = await readFile(new URL(import.meta.resolve("axe-core/axe.min.js")), "utf8");
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await context.addInitScript(() => localStorage.setItem("miss-v-token", "isolated-fixture-token"));
await context.route("**/*", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const send = (data, status = 200) => route.fulfill({ json: data, status });
  if (path === "/api/public/images/507f1f77bcf86cd799439099")
    return route.fulfill({
      body: await readFile("public/landing-assets/web/bold-market/market-hero-1536.webp"),
      contentType: "image/webp",
    });
  if (!["fetch", "xhr"].includes(request.resourceType()))
    return request.url().startsWith(url) ? route.continue() : route.abort();
  if (request.url().startsWith(url) && !path.startsWith("/api/")) return route.continue();
  if (path.endsWith("/auth/me"))
    return send({
      owner: {
        id: "owner",
        name: "Demo owner",
        email: "owner@example.test",
        role: 0,
        roleName: "Owner",
        status: "ACTIVE",
        isApproved: true,
        emailVerified: true,
        isHighestRole: true,
        businessName: "Demo merchant",
      },
    });
  if (path.endsWith("/landing-page/templates"))
    return send({ templates: landingTemplates, schemaVersion: 2 });
  if (path.endsWith("/landing-page") && request.method() === "GET")
    return send({
      page: pageRecord,
      variants,
      catalogItems: catalog,
      menuItems: [],
      capabilities: { schemaVersions: [1, 2], templates: true },
    });
  if (path.endsWith("/public/landing-pages/demo-store"))
    return send({
      slug: "demo-store",
      siteTitle: "Demo merchant",
      seoDescription: "",
      variant: published,
      catalogItems: catalog,
      menuItems: [],
      serverTime: new Date().toISOString(),
    });
  const match = /\/landing-page\/variants\/(variant\d+)(\/reset|\/publish)?$/.exec(path);
  if (match) {
    const i = variants.findIndex((v) => v._id === match[1]);
    if (i < 0) return send({ message: "Not found" }, 404);
    if (match[2] === "/reset") {
      const old = variants[i];
      variants[i] = {
        ...old,
        ...createLandingPreset(
          old.template.id,
          old.template.revision,
          old.goal,
          { businessName: "Demo merchant" },
          catalog,
        ),
        name: old.name,
      };
      return send(variants[i]);
    }
    if (match[2] === "/publish") {
      published = structuredClone(variants[i]);
      pageRecord.isPublished = true;
      pageRecord.publishedVariantId = variants[i]._id;
      pageRecord.publishedAt = new Date().toISOString();
      return send(pageRecord);
    }
    if (request.method() === "PATCH") {
      active++;
      maxActive = Math.max(maxActive, active);
      const update = request.postDataJSON();
      const validated = safeParse(landingPageVariantUpdateSchema, update);
      if (!validated.success) {
        active--;
        return send({ message: validated.issues.map((issue) => issue.message).join("; ") }, 422);
      }
      writes.push(update);
      await new Promise((r) => setTimeout(r, 300));
      active--;
      if (failSave) {
        failSave = false;
        return send({ message: "Simulated save failure" }, 500);
      }
      variants[i] = { ...variants[i], ...update, updatedAt: new Date().toISOString() };
      return send(variants[i]);
    }
  }
  if (path.endsWith("/landing-page/variants") && request.method() === "POST") {
    const input = request.postDataJSON();
    const created = {
      _id: `variant${variants.length}`,
      ...createLandingPreset(
        input.templateId ?? "bold-market",
        input.templateRevision,
        input.goal,
        { businessName: "Demo merchant" },
        catalog,
      ),
      name: input.name,
    };
    variants.push(created);
    return send(created, 201);
  }
  if (path.endsWith("/orders") && request.method() === "POST") {
    orders++;
    orderBodies.push(request.postDataJSON());
    await new Promise((r) => setTimeout(r, 250));
    if (failOrder) {
      failOrder = false;
      return send({ message: "Simulated order failure" }, 500);
    }
    return send({ orderNumber: "TEST-1", total: 818, status: "PENDING" });
  }
  if (path.endsWith("/orders")) return send({ pendingCount: 0, items: [] });
  return send({});
});
const results = {
  widths: [],
  templates: [],
  accessibility: [],
  scope: "Real rendered application against isolated API fixtures; no production changes",
};
try {
  await page.goto(`${url}/landing-page`);
  await page.locator("iframe").waitFor();
  const frame = page.frameLocator("iframe");
  await frame.locator("h1").waitFor();
  await page.screenshot({ path: `${output}/editor-desktop.png` });
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  assert.equal(await page.locator(".lb-template-list article").count(), 5);
  results.templatePanel = true;
  await page
    .locator(".lb-template-list article")
    .last()
    .getByRole("button", { name: "View template" })
    .click();
  assert.equal(await page.locator(".lb-template-detail-images img").count(), 3);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  results.farmCompanionPreview = true;
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  const original = JSON.parse(JSON.stringify(variants[0].sections));
  await page.getByRole("button", { name: "Color", exact: true }).click();
  await page.waitForTimeout(1250);
  assert.equal(variants[0].theme.background.mode, "COLOR");
  assert.deepEqual(variants[0].sections, original);
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page
    .getByLabel("Use a sample asset")
    .selectOption("/landing-assets/web/bold-market/market-hero-1536.webp");
  await page.waitForTimeout(1250);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.waitForTimeout(1250);
  assert.equal(variants[0].theme.background.mode, "THREE_D");
  assert.ok(variants[0].theme.background.image);
  assert.deepEqual(variants[0].sections, original);
  results.backgroundPreferences = true;
  await page.getByRole("tab", { name: "Sections", exact: true }).click();
  await page.getByRole("button", { name: /^Hero ·/ }).click();
  const title = page.getByLabel("Title", { exact: true });
  await title.fill("One");
  await page.waitForTimeout(800);
  await title.fill("Newest saved headline");
  await page.waitForTimeout(1400);
  assert.equal(variants[0].sections[1].components[0].content.title, "Newest saved headline");
  assert.equal(maxActive, 1);
  results.serialAutosave = true;
  failSave = true;
  await title.fill("Retry headline");
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.waitForTimeout(650);
  assert.equal(variants[0].sections[1].components[0].content.title, "Retry headline");
  results.retry = true;
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForTimeout(1250);
  assert.equal(variants[0].sections[1].components[0].content.title, "Newest saved headline");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.waitForTimeout(1250);
  assert.equal(variants[0].sections[1].components[0].content.title, "Retry headline");
  results.history = true;
  await page.getByRole("button", { name: "Mobile", exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await frame.locator("body").evaluate(() => innerWidth), 390);
  await page.getByRole("button", { name: "Tablet", exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await frame.locator("body").evaluate(() => innerWidth), 768);
  results.viewportPreview = true;
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await frame.getByRole("button", { name: "Quick view", exact: true }).first().click();
  await frame.getByRole("dialog").waitFor();
  await frame.getByRole("button", { name: "Add to cart", exact: true }).last().click();
  assert.equal(orders, 0);
  results.sandboxPreview = true;
  await page.getByRole("button", { name: "Back to editing", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText(/Recent changes will be lost/)
    .waitFor();
  await page.getByRole("button", { name: "Reset variant", exact: true }).click();
  await page.waitForTimeout(550);
  assert.notEqual(variants[0].sections[1].components[0].content.title, "Retry headline");
  results.reset = true;
  await page.getByLabel("Variant", { exact: true }).selectOption("variant1");
  await frame.getByRole("heading", { name: "Make it your own.", exact: true }).waitFor();
  await page.getByLabel("Variant", { exact: true }).selectOption("variant0");
  await frame.getByRole("heading", { name: "Good things. Great taste.", exact: true }).waitFor();
  results.variantSwitch = true;
  await page.getByRole("button", { name: "Header · Demo merchant", exact: true }).click();
  await page.getByRole("tab", { name: "Style", exact: true }).click();
  await page.getByLabel("Layout", { exact: true }).selectOption("CENTERED");
  await frame.locator(".lp-layout-centered .lp-header").waitFor();
  const centered = await frame.locator(".lp-header").evaluate((header) => {
    const h = header.getBoundingClientRect(),
      b = header.querySelector(".lp-brand").getBoundingClientRect();
    return Math.abs(h.left + h.width / 2 - (b.left + b.width / 2));
  });
  assert.ok(centered < 1);
  await page.getByLabel("Layout", { exact: true }).selectOption("SPLIT");
  await frame.locator(".lp-layout-split .lp-header").waitFor();
  assert.ok(
    await frame
      .locator(".lp-header")
      .evaluate(
        (header) =>
          header.querySelector(".lp-brand").getBoundingClientRect().width <
          header.getBoundingClientRect().width / 2,
      ),
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForTimeout(1250);
  results.headerLayouts = true;
  const beforeHide = JSON.parse(JSON.stringify(variants[0].sections));
  await page.getByRole("button", { name: "Collection", exact: true }).hover();
  await page.getByRole("button", { name: "Hide Collection", exact: true }).click();
  await page.waitForTimeout(1250);
  assert.equal(
    variants[0].sections.find((section) => section.name === "Collection").enabled,
    false,
  );
  assert.equal(safeParse(landingPageVariantUpdateSchema, variants[0]).success, true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForTimeout(1250);
  assert.deepEqual(variants[0].sections, beforeHide);
  results.linkedSectionHideUndo = true;
  for (const w of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.screenshot({ path: `${output}/editor-mobile.png` });
  await page.getByRole("button", { name: "Sections & templates", exact: true }).click();
  for (const box of await page
    .locator(".lb-left .lb-tree-actions button:visible")
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const r = button.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }),
    ))
    assert.ok(box.width >= 44 && box.height >= 44);
  await page.getByRole("button", { name: /^Hero ·/ }).click();
  assert.equal(await page.locator(".lb-panel-open").count(), 1);
  assert.ok(await page.locator("#landing-inspector").isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".lb-panel-open").count(), 0);
  assert.ok(
    await page
      .getByRole("button", { name: "Inspector", exact: true })
      .evaluate((button) => button === document.activeElement),
  );
  results.mobilePanelsAndTargets = true;
  results.editorResponsive = true;
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const variant of variants.slice(0, 5)) {
    published = structuredClone(variant);
    await page.goto(`${url}/site/demo-store`);
    await page.locator(".lp-storefront h1").waitFor();
    for (const w of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width: w, height: 1000 });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".lp-storefront *"))
          .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            width: el.getBoundingClientRect().width,
            text: el.textContent?.slice(0, 80),
          })),
      );
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${variant.template.id} overflows at ${w}: ${JSON.stringify(overflow)}`,
      );
      assert.equal(await page.locator(".lp-storefront h1").count(), 1);
      results.widths.push(`${variant.template.id}:${w}`);
      if (w === 1440 || w === 390) {
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(350);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: `${output}/${variant.template.id}-${w}.png`,
          fullPage: true,
        });
      }
    }
    await page.addScriptTag({ content: axeSource });
    const a11y = await page.evaluate(async () => {
      const report = await window.axe.run(".lp-storefront", {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return report.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      }));
    });
    results.accessibility.push({ template: variant.template.id, violations: a11y });
    assert.deepEqual(a11y, [], `${variant.template.id} accessibility violations`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${variant.template.id}-opening.png` });
    results.templates.push(variant.template.id);
  }
  published = structuredClone(variants[1]);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${url}/site/demo-store`);
  const productRail = page.getByRole("region", { name: "products", exact: true });
  await productRail.focus();
  await page.keyboard.press("ArrowRight");
  assert.ok(
    await productRail.evaluate((element) => element.scrollLeft > 0),
    "The product rail must scroll with the keyboard",
  );
  await page.getByRole("button", { name: "Previous products", exact: true }).click();
  assert.equal(await productRail.evaluate((element) => element.scrollLeft), 0);
  results.keyboardRail = true;
  published = structuredClone(variants[0]);
  published.theme.background = {
    ...published.theme.background,
    mode: "IMAGE",
    image: {
      url: "/api/images/507f1f77bcf86cd799439099",
      alt: "Stored backdrop",
      focalPoint: { x: 0.5, y: 0.5 },
      aspectRatio: "WIDE",
    },
  };
  const hero = published.sections
    .flatMap((section) => section.components)
    .find((block) => block.type === "HERO");
  hero.content.media = {
    ...(hero.content.media ?? hero.content.layers[0].media),
    mobileUrl: "/api/images/507f1f77bcf86cd799439099",
  };
  hero.content.layers = [];
  await page.goto(`${url}/site/demo-store`);
  await page.waitForFunction(() => {
    const images = [
      document.querySelector(".lp-background img"),
      document.querySelector(".lp-main-image"),
    ];
    return images.every((img) => img?.src.startsWith("blob:") && img.naturalWidth > 0);
  });
  const frames = published.sections
    .flatMap((section) => section.components)
    .filter((block) => block.type === "MEDIA_STORY")
    .reduce((total, block) => total + block.content.frames.length, 0);
  assert.equal(await page.locator(".lp-story-frames figure").count(), frames);
  assert.equal(await page.locator(".lp-story-sticky").count(), 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.locator(".lp-story-frames figure").count(), frames);
  for (const section of published.sections.filter((section) =>
    section.components.every((block) => block.type === "FAQ" && !block.content.items.length),
  ))
    assert.equal(
      await page
        .locator(`[id="${section.id}"]`)
        .evaluate((element) => element.getBoundingClientRect().height),
      0,
    );
  results.storedMediaAndStackedFallback = true;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  published = structuredClone(variants[3]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${url}/site/demo-store`);
  await page.getByRole("button", { name: "Quick view", exact: true }).first().click();
  await page.getByRole("dialog").waitFor();
  const before = await page.locator(".lp-header-utilities").innerText();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".lp-header-utilities").innerText(), before);
  results.quickViewNoCartMutation = true;
  await page.getByRole("button", { name: "Shop now", exact: true }).first().click();
  await page.getByRole("dialog").getByText("Your cart", { exact: true }).waitFor();
  assert.equal(orders, 0);
  await page.keyboard.press("Escape");
  results.shopNowReview = true;
  await page.evaluate(() => localStorage.removeItem("miss-v-cart:demo-store"));
  published = structuredClone(variants[4]);
  published.commerce.deliveryFee = 20;
  await page.goto(`${url}/site/demo-store`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
  await page.getByRole("button", { name: "Add one Everyday collection" }).click();
  assert.match(await page.locator(".lp-order-panel").innerText(), /798\.00/);
  await page.getByRole("button", { name: "Review and place order" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test customer");
  await page.getByLabel("Mobile number", { exact: true }).fill("09171234567");
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.getByLabel("Delivery address").fill("Isolated test address");
  assert.match(await page.locator(".lp-order-panel form").innerText(), /818\.00/);
  failOrder = true;
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page.getByText("Simulated order failure", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await page.getByText("Order received: TEST-1", { exact: true }).waitFor();
  assert.equal(orderBodies[0].idempotencyKey, orderBodies[1].idempotencyKey);
  assert.equal(orderBodies[1].items[0].quantity, 2);
  results.inlineCheckoutRetry = true;
  await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
  await page.getByRole("button", { name: "Review and place order" }).waitFor();
  results.orderSuccessReset = true;
  published = structuredClone(variants[2]);
  await page.goto(`${url}/site/demo-store`);
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator(".lp-background canvas").waitFor({ timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelector(".lp-background-canvas")?.style.opacity === "1",
  );
  results.webGLRendered = true;
  await page
    .locator(".lp-background canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await page.waitForFunction(() => !document.querySelector(".lp-background canvas"));
  assert.ok(await page.locator(".lp-background img").isVisible());
  results.contextLossPoster = true;
  await context.route("**/landing-assets/models/**", (route) => route.abort());
  await page.reload();
  await page.waitForTimeout(1300);
  assert.equal(await page.locator(".lp-background-canvas").evaluate((el) => el.style.opacity), "0");
  assert.equal(await page.locator(".lp-storefront h1").count(), 1);
  results.modelFailurePoster = true;
  await context.unroute("**/landing-assets/models/**");
  await page.reload();
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForFunction(
    () => document.querySelector(".lp-background-canvas")?.style.opacity === "1",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => !document.querySelector(".lp-background canvas"));
  assert.equal(await page.locator(".lp-storefront h1").count(), 1);
  results.reducedMotionPoster = true;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await context.route("**/landing-assets/draco/**", (route) => route.abort());
  await page.reload();
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(1800);
  assert.equal(await page.locator(".lp-background-canvas").evaluate((el) => el.style.opacity), "0");
  results.decoderFailurePoster = true;
  await context.unroute("**/landing-assets/draco/**");
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    }),
  );
  await page.reload();
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".lp-background canvas").count(), 0);
  results.saveDataPoster = true;
  assert.deepEqual(errors, []);
  results.pageErrors = errors;
  results.orderRequests = orders;
  results.passed = true;
} finally {
  await writeFile(`${output}/verification.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));
