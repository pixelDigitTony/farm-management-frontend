import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import {
  createLandingPreset,
  landingTemplates,
} from "../../farm-management-backend/dist/services/landing-presets.js";

const base = process.env.LANDING_TEST_URL ?? "http://127.0.0.1:4187";
const output = "test-results/landing-access-mobile";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const width of [320, 390, 430, 767, 768, 844, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 844 ? 390 : 900 },
      reducedMotion: width === 430 ? "reduce" : "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const owner = {
      id: "owner",
      name: "Owner",
      email: "owner@example.test",
      role: 0,
      isHighestRole: true,
      isApproved: true,
      emailVerified: true,
      status: "ACTIVE",
      permissions: ["landing-page:view", "landing-page:edit"],
      businessName: "Demo merchant",
    };
    await context.addInitScript((owner) => {
      localStorage.setItem("miss-v-token", "fixture");
      localStorage.setItem("miss-v-user", JSON.stringify(owner));
    }, owner);
    const variant = {
      ...createLandingPreset(
        "everyday-boutique",
        undefined,
        undefined,
        { businessName: "Demo merchant" },
        [],
      ),
      _id: "variant-one",
      landingPageId: "page-one",
      revision: 1,
    };
    const hero = variant.sections
      .flatMap((section) => section.components)
      .find((block) => block.type === "HERO");
    hero.content.media = {
      url: "/api/images/507f1f77bcf86cd799439099",
      alt: "Slow proof",
      aspectRatio: "PORTRAIT",
      focalPoint: { x: 0.5, y: 0.5 },
    };
    hero.content.stripMedia = [hero.content.media];
    const record = {
      _id: "page-one",
      slug: "demo-store",
      siteTitle: "Demo merchant",
      name: "Demo merchant",
      seoDescription: "",
      revision: 1,
      isPublished: true,
      publishedVariantId: variant._id,
      publicAccess: { mode: "INACTIVE", startsAt: null, endsAt: null, timezone: "Asia/Manila" },
      accessStatus: "Inactive",
      isAccessible: false,
    };
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const calls = [];
    let publicReads = 0;
    await context.route("**/*", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      const send = (json, status = 200) => route.fulfill({ json, status });
      if (path.endsWith("/public/images/507f1f77bcf86cd799439099")) {
        await gate;
        return route.fulfill({
          body: await readFile("public/landing-assets/web/everyday-boutique/boutique-red-960.webp"),
          contentType: "image/webp",
        });
      }
      if (!path.startsWith("/api/"))
        return request.url().startsWith(base) ? route.continue() : route.abort();
      if (path.endsWith("/public/landing-pages/demo-store")) {
        publicReads++;
        if (publicReads > 1) return send({ message: "This page is currently unavailable" }, 404);
        return send({
          slug: "demo-store",
          pageId: record._id,
          businessId: "business",
          siteTitle: record.siteTitle,
          seoDescription: "",
          variant,
          catalogItems: [],
          menuItems: [],
          serverTime: new Date().toISOString(),
          nextTransitionAt: new Date(Date.now() + 1000).toISOString(),
        });
      }
      if (path.endsWith("/auth/me")) return send({ owner });
      if (path.endsWith("/landing-page/templates"))
        return send({ templates: landingTemplates, schemaVersion: 2 });
      if (path.endsWith("/landing-page/pages")) return send({ items: [record] });
      if (path.endsWith("/landing-page/saved-templates")) return send({ items: [] });
      if (path.endsWith("/landing-page/pages/page-one"))
        return send({ page: record, variants: [variant], catalogItems: [], menuItems: [] });
      if (path.endsWith("/landing-page/pages/page-one/access")) {
        calls.push(request.postDataJSON());
        record.publicAccess.mode = calls.at(-1).mode;
        record.revision++;
        record.isAccessible = record.publicAccess.mode === "IMMEDIATE";
        record.accessStatus = record.isAccessible ? "Active" : "Inactive";
        return send(record);
      }
      if (path.includes("/variants/") && request.method() === "PATCH") {
        Object.assign(variant, request.postDataJSON(), { revision: variant.revision + 1 });
        return send(variant);
      }
      return send({ items: [] });
    });
    await page.goto(`${base}/landing-page?page=page-one`);
    await page.locator("iframe").waitFor();
    const frame = page.frameLocator("iframe");
    const image = frame.getByAltText("Slow proof");
    await image.waitFor({ state: "attached" });
    await image.scrollIntoViewIfNeeded();
    assert.equal(await image.getAttribute("data-image-state"), "loading");
    assert.equal(await image.evaluate((element) => getComputedStyle(element).opacity), "0");
    const initialMediaHeight = await image.evaluate(
      (element) => element.closest(".landing-media").getBoundingClientRect().height,
    );
    if (width === 430)
      assert.equal(
        await image.evaluate(
          (element) =>
            getComputedStyle(
              element.closest(".landing-media").querySelector(".landing-media-skeleton"),
            ).animationName,
        ),
        "none",
      );
    await page.screenshot({ path: `${output}/${width}-loading.png` });
    release();
    await image.waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        document
          .querySelector("iframe")
          ?.contentDocument?.querySelector('[alt="Slow proof"]')
          ?.getAttribute("data-image-state") === "ready",
    );
    assert.ok(
      Math.abs(
        initialMediaHeight -
          (await image.evaluate(
            (element) => element.closest(".landing-media").getBoundingClientRect().height,
          )),
      ) < 1,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    if (width < 768) {
      assert.ok(await page.getByRole("navigation", { name: "Editor tools" }).isVisible());
      await page.getByRole("button", { name: "Sections", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.screenshot({ path: `${output}/${width}-sections.png` });
      await page.getByRole("button", { name: /Back to canvas/ }).click();
      if (width === 390) {
        const testimonial = variant.sections
          .flatMap((section) => section.components)
          .find((block) => block.type === "TESTIMONIALS");
        await frame.locator(`[data-block-id="${testimonial.id}"]`).click();
        await page.getByRole("button", { name: "+ Add entries", exact: true }).click();
        await page.getByLabel("Show block", { exact: true }).uncheck();
        await page.waitForFunction(
          () => document.querySelector(".lb-phone-save")?.textContent === "Saved",
        );
        await page.getByLabel("Show block", { exact: true }).check();
        await page.getByLabel("Quote", { exact: true }).fill('Great harvest < > & " &#x20;');
        await page.getByLabel("Author", { exact: true }).fill("Customer");
        await page.waitForFunction(
          () => document.querySelector(".lb-phone-save")?.textContent === "Saved",
        );
        await page.screenshot({ path: `${output}/${width}-testimonial.png` });
        await page.getByRole("button", { name: /Back to canvas/ }).click();
      }
      await page.getByRole("button", { name: "More", exact: true }).click();
      if (width === 390) {
        await page.getByRole("button", { name: "Templates", exact: true }).click();
        assert.ok(await page.getByRole("button", { name: "Browse design templates" }).isVisible());
        assert.equal(
          await page.getByRole("button", { name: "Delete page", exact: true }).count(),
          0,
        );
        await page.getByRole("button", { name: /Back to canvas/ }).click();
        await page.getByRole("button", { name: "More", exact: true }).click();
      }
      await page.getByRole("button", { name: "Publishing", exact: true }).click();
      await page.getByRole("switch").click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(calls.length, 0);
      if (width === 390) {
        await page.getByRole("switch").click();
        await page.goBack();
        await page
          .getByRole("dialog", { name: "Make landing page active" })
          .waitFor({ state: "hidden" });
        assert.ok(await page.getByRole("dialog", { name: "Publishing", exact: true }).isVisible());
      }
      await page.getByRole("switch").click();
      await page.getByRole("button", { name: "Make active", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[role="switch"]')?.checked === true);
      assert.equal(calls.length, 1);
      await page.screenshot({ path: `${output}/${width}-publishing.png` });
      await page.getByRole("button", { name: /Back to canvas/ }).click();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      await page.screenshot({ path: `${output}/${width}-edit.png` });
      await page.getByRole("button", { name: /Back to canvas/ }).click();
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      assert.equal(await page.getByRole("navigation", { name: "Editor tools" }).count(), 0);
      await page.getByRole("button", { name: "Back to editing", exact: true }).click();
    }
    await page.screenshot({ path: `${output}/${width}-canvas.png` });
    await page.goto(`${base}/site/demo-store`);
    await page.getByText("This page is currently unavailable", { exact: true }).waitFor();
    assert.equal(await page.locator(".lp-storefront").count(), 0);
    assert.deepEqual(errors, []);
    results.push({ width, passed: true, accessMutations: calls.length, errors });
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
