import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "@playwright/test";
import { installQaRoutes, makeQaState, makeQaVariant, qaPlainName, qaVariantName, qaSlug, qaStoredId, qaTemplateIds } from "./landing-mobile-qa-fixtures.mjs";

// Non-fail-fast acceptance runner. Baseline intentionally exits 0 with known failures;
// acceptance exits 1 when any check fails. All API traffic is intercepted before navigation.
const qaArgs = process.argv.slice(2);
const qaOption = (name, fallback) => { const index = qaArgs.indexOf(`--${name}`); return index < 0 ? fallback : qaArgs[index + 1]; };
const qaPhase = qaOption("phase", "baseline");
const qaUrl = qaOption("url", "http://127.0.0.1:4182");
const qaBrowserName = qaOption("browser", "chromium");
const qaOnly = qaOption("only", "all");
const qaRoot = fileURLToPath(new URL("../../", import.meta.url));
const qaFrontend = path.join(qaRoot, "farm-management-frontend");
const qaSourceRoot = path.resolve(qaRoot, qaOption("source-root", qaFrontend));
const qaOutput = path.resolve(qaRoot, qaOption("output", `design/landing-mobile-refinement-2026-11-01/qa-${qaPhase}`));
await mkdir(qaOutput, { recursive: true });
const qaChecks = [];
const qaErrors = [];
const qaTraffic = [];
const qaStarted = new Date().toISOString();
const qaChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const qaAvailability = Object.fromEntries(Object.entries({ chromium, firefox, webkit }).map(([name, type]) => [name, { executable: name === "chromium" && existsSync(qaChrome) ? qaChrome : type.executablePath(), installed: existsSync(name === "chromium" && existsSync(qaChrome) ? qaChrome : type.executablePath()) }]));
const qaSourceFiles = [
  "src/pages/PublicLandingPage.tsx", "src/pages/LandingPreviewPage.tsx",
  "src/components/landing-page/LandingPageRenderer.tsx", "src/components/landing-page/blocks/StorefrontBlocks.tsx",
  "src/components/landing-page/storefront.css", "src/components/StoredImage.tsx",
  "src/components/landing-page/ResponsiveImage.tsx", "src/components/landing-page/Background.tsx",
];
const qaSourceHashes = Object.fromEntries(await Promise.all(qaSourceFiles.map(async (name) => [name, createHash("sha256").update(await readFile(path.join(qaSourceRoot, name))).digest("hex")])));
const qaBrowser = await ({ chromium, firefox, webkit }[qaBrowserName]).launch({
  headless: true,
  ...(qaBrowserName === "chromium" ? { executablePath: qaAvailability.chromium.executable, args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] } : {}),
});
const qaAxe = await readFile(new URL(import.meta.resolve("axe-core/axe.min.js")), "utf8");

async function qaCheck(id, requirement, action) {
  const start = Date.now();
  try {
    const evidence = await action();
    qaChecks.push({ id, requirement, status: "PASS", durationMs: Date.now() - start, evidence });
    console.log(`PASS ${id}`);
  } catch (error) {
    qaChecks.push({ id, requirement, status: "FAIL", durationMs: Date.now() - start, error: error.message });
    console.log(`FAIL ${id}: ${error.message.split("\n")[0]}`);
  }
}
function qaExpect(condition, message, details) { assert.ok(condition, `${message}${details === undefined ? "" : `: ${JSON.stringify(details)}`}`); }

async function qaSession(state = makeQaState(), { width = 390, height = 844, clock = false, token = false, reducedMotion = "reduce" } = {}) {
  const context = await qaBrowser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers: "block" });
  await installQaRoutes(context, state, new URL(qaUrl).origin);
  if (token) await context.addInitScript(() => localStorage.setItem("miss-v-token", "isolated-fixture-token"));
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => qaErrors.push({ message: error.message, template: state.variant.template.id }));
  if (clock) await page.clock.install();
  await page.goto(`${qaUrl}/site/${state.slug}`);
  if (state.status === 200) {
    try { await page.locator(".lp-storefront h1").waitFor({ timeout: 30000 }); }
    catch (error) {
      await page.screenshot({ path: path.join(qaOutput, "setup-error.png") });
      await writeFile(path.join(qaOutput, "setup-error.json"), JSON.stringify({ url: page.url(), body: await page.locator("body").innerText(), requests: state.requests, unexpected: state.unexpectedApi, pageErrors: qaErrors }, null, 2));
      await context.close();
      throw error;
    }
  }
  else await page.locator("h1").waitFor({ timeout: 30000 });
  return { page, context, state, close: async () => {
    state.pendingRelease?.();
    qaTraffic.push({ template: state.variant.template.id, requests: state.requests.length, imageRequests: state.imageRequests, orderBodies: state.orders, unexpectedApi: state.unexpectedApi, blockedExternalCount: state.blockedExternal.length });
    await context.close();
  } };
}
async function qaCase(state, options, action) {
  let session;
  try { session = await qaSession(state, options); return await action(session); }
  catch (error) {
    qaChecks.push({ id: `scenario-error-${state.variant.template.id}-${qaChecks.length}`, requirement: "Scenario setup/completion; investigate before product verdict", status: "ERROR", error: error.message });
    console.log(`ERROR scenario ${state.variant.template.id}: ${error.message.split("\n")[0]}`);
  } finally { await session?.close(); }
}
const qaCard = (page, index = 1) => page.locator(`#product-${qaStoredId(index)}`);
async function qaScreenshot(page, name) {
  await page.waitForTimeout(90);
  const visibleImages = page.locator("img:visible");
  await visibleImages.evaluateAll(async (images) => { await Promise.all(images.filter((img) => { const r = img.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map((img) => img.complete ? null : Promise.race([new Promise((resolve) => { img.addEventListener("load", resolve, { once: true }); img.addEventListener("error", resolve, { once: true }); }), new Promise((resolve) => setTimeout(resolve, 1200))]))); });
  await page.screenshot({ path: path.join(qaOutput, `${name}.png`), animations: "disabled" });
  return `${name}.png`;
}
async function qaOpenCart(page) {
  const publicBar = page.locator(".lp-public-cart-bar");
  if (await publicBar.isVisible()) {
    const barButton = publicBar.getByRole("button");
    if (await barButton.count()) await barButton.first().click();
    else await publicBar.click();
  } else await page.getByRole("button", { name: /^Open cart,/ }).click();
  await page.getByRole("dialog").getByRole("heading", { name: "Your cart", exact: true }).waitFor();
}
async function qaAddPlain(page) { await qaCard(page).getByRole("button", { name: "Add to cart", exact: true }).click(); }
async function qaCheckout(page) {
  await qaAddPlain(page);
  await qaOpenCart(page);
  await page.getByRole("button", { name: "Continue to checkout", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).waitFor();
  await page.getByLabel("Name", { exact: true }).fill("QA Customer Retained");
  await page.getByLabel("Mobile number", { exact: true }).fill("09171234567");
  await page.getByLabel("Email (optional)", { exact: true }).fill("qa@example.test");
  await page.getByLabel("Order notes (optional)", { exact: true }).fill("Retain these notes during refresh");
}
async function qaRefresh(page, state, mutate) {
  mutate(state);
  const refreshed = page.waitForResponse((response) => /\/public\/landing-pages\/[^/]+$/.test(new URL(response.url()).pathname));
  await page.clock.fastForward(30_100);
  await refreshed;
  await page.waitForTimeout(80);
}
async function qaA11y(page) {
  await page.addScriptTag({ content: qaAxe });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })));
}

try {
  const snapshot = qaTemplateIds.map((id) => ({ id, ...makeQaState(id), imageFailures: [], privateImageIds: [] }));
  await writeFile(path.join(qaOutput, "fixture-snapshot.json"), JSON.stringify(snapshot, null, 2));
  if (["all", "responsive"].includes(qaOnly)) {
    for (const template of qaTemplateIds) {
      await qaCase(makeQaState(template), {}, async ({ page }) => {
        for (const width of [320, 360, 390, 430, 704, 768, 1440]) {
          await page.setViewportSize({ width, height: width <= 430 ? (width === 320 ? 667 : 844) : 1000 });
          await page.evaluate(() => scrollTo(0, 0));
          await qaCheck(`${template}-${width}-reflow`, "§6 responsive matrix; standard hero, catalog, footer", async () => {
            const images = [];
            images.push(await qaScreenshot(page, `${template}-${width}-hero`));
            const metrics = await page.evaluate(() => {
              const action = document.querySelector(".lp-hero .lp-actions a, .lp-boutique-hero .lp-actions a");
              const r = action?.getBoundingClientRect();
              const hero = document.querySelector(".lp-hero, .lp-boutique-hero");
              return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, primaryAction: r ? { top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null, titleCount: document.querySelectorAll(".lp-storefront h1").length, heroHeight: hero?.getBoundingClientRect().height };
            });
            // Escape is an inquiry preset with an offerings showcase, not a catalog.
            const collection = page.locator(".lp-catalog, .lp-showcase").first();
            await collection.scrollIntoViewIfNeeded();
            await collection.evaluate((el) => { const r = el.getBoundingClientRect(); scrollBy(0, r.top - 70); });
            images.push(await qaScreenshot(page, `${template}-${width}-catalog`));
            await page.locator(".lp-footer").scrollIntoViewIfNeeded();
            images.push(await qaScreenshot(page, `${template}-${width}-footer`));
            qaExpect(metrics.scrollWidth <= width + 1, "Page-level horizontal overflow", metrics);
            qaExpect(metrics.titleCount === 1, "One primary heading required", metrics);
            return { metrics, images };
          });
          if (width === 390) await qaCheck(`${template}-primary-action-in-opening`, "§4.4 standard primary action visible at 390×844", async () => {
            await page.evaluate(() => scrollTo(0, 0));
            const box = await page.locator(".lp-hero .lp-actions a, .lp-boutique-hero .lp-actions a").first().boundingBox();
            qaExpect(box && box.y >= 0 && box.y + box.height <= 844, "Primary action below the initial viewport", box);
            return box;
          });
          if (width === 704 && template === "everyday-boutique") await qaCheck("boutique-704-composition", "§4.4 four strip photos and two compact product columns at 704px", async () => {
            const metrics = await page.evaluate(() => { const cards = [...document.querySelectorAll(".lp-product")].slice(0, 2).map((el) => el.getBoundingClientRect()); return { stripPhotos: document.querySelectorAll(".lp-strip img").length, cards: cards.map((r) => ({ x: r.x, y: r.y, width: r.width })) }; });
            qaExpect(metrics.stripPhotos === 4, "Expected four tablet strip photos", metrics);
            qaExpect(metrics.cards.length === 2 && Math.abs(metrics.cards[0].y - metrics.cards[1].y) < 4, "Expected two tablet product columns", metrics);
            return metrics;
          });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await qaCheck(`${template}-document-a11y`, "§6 full-document automated accessibility", async () => { const violations = await qaA11y(page); await writeFile(path.join(qaOutput, `${template}-a11y.json`), JSON.stringify(violations, null, 2)); qaExpect(violations.length === 0, "Full document axe violations", violations); return { violations }; });
      });
    }
  }

  if (["all", "functional"].includes(qaOnly)) {
    await qaCase(makeQaState(), {}, async ({ page, state }) => {
      await qaCheck("fixture-integrity", "Populated isolated fixture matches preset refs and tenant/page contract", async () => {
        qaExpect(state.catalog.length === 30 && state.catalog.every((item) => item.key === `${item.sourceType}:${item.sourceId}`), "Invalid fixture keys");
        qaExpect(await page.locator(".lp-product").count() === 24, "Expected 24 initially visible products");
        const allRefs = state.variant.sections.flatMap((section) => section.components).filter((block) => block.type === "CATALOG").flatMap((block) => block.content.catalogItemRefs);
        qaExpect(allRefs.length === 30 && allRefs.every((ref) => state.catalog.some((item) => item.key === `${ref.sourceType}:${ref.sourceId}`)), "Preset references not consistent with fixture catalog");
        return { products: 30, initialCards: 24, pageId: state.pageId, businessId: state.businessId };
      });
      await qaCheck("catalog-load-more", "§6 more than 24 products", async () => { await page.getByRole("button", { name: /^Load more products/ }).click(); qaExpect(await page.locator(".lp-product").count() === 30, "Load more omitted products"); return { cards: 30 }; });
      await qaCheck("available-minimum-price", "§4.2 minimum price excludes unavailable variants", async () => { const text = await qaCard(page, 2).innerText(); qaExpect(/900/.test(text) && !/From\s*₱?1\.00/i.test(text), "Unavailable variant determines advertised price", text); return text; });
      await qaCheck("all-variants-unavailable", "§4.2 explicit unavailable state when no variant is purchasable", async () => { const card = qaCard(page, 3); const text = await card.innerText(); qaExpect(/unavailable|sold out/i.test(text), "All-unavailable product advertised as purchasable", text); return text; });
      await qaCheck("variant-search", "§4.2 variant names and attributes searchable", async () => { await page.getByRole("searchbox").fill("Indigo"); qaExpect(await qaCard(page, 2).count() === 1, "Variant attribute search excluded matching product"); return { cards: await page.locator(".lp-product").count() }; });
      await page.getByRole("searchbox").fill("");
      await qaCheck("clear-both-filters", "§4.2 Clear filters resets text and category", async () => {
        await page.getByRole("navigation", { name: "Collection categories" }).getByRole("button", { name: "Textiles", exact: true }).click();
        await page.getByRole("searchbox").fill("does-not-exist");
        await page.getByRole("button", { name: /Clear filters/i }).click();
        qaExpect(await page.getByRole("searchbox").inputValue() === "" && await page.locator(".lp-product").count() >= 24, "Clear filters did not reset both filters");
      });
    });

    for (const template of qaTemplateIds) await qaCase(makeQaState(template), {}, async ({ page, state }) => {
      await qaCheck(`${template}-navigation-focus-theme`, "§4.2 keyboard navigation close restores focus and theme", async () => {
        const opener = page.getByRole("button", { name: "Open navigation", exact: true });
        await opener.focus(); await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog"); await dialog.waitFor();
        const primary = await dialog.evaluate((el) => getComputedStyle(el).getPropertyValue("--lp-primary").trim());
        await qaScreenshot(page, `${template}-390-navigation`);
        await page.keyboard.press("Escape");
        const focused = await opener.evaluate((el) => el === document.activeElement);
        qaExpect(primary.toLowerCase() === state.variant.theme.primaryColor.toLowerCase(), "Navigation portal lost theme token", { primary, expected: state.variant.theme.primaryColor, focusRestored: focused });
        qaExpect(focused, "Navigation close did not restore opener focus");
      });
      if (await page.locator(".lp-catalog").count()) await qaCheck(`${template}-details-focus-theme`, "§4.2 keyboard Quick View restores focus and theme", async () => {
        const opener = qaCard(page).getByRole("button", { name: /Quick view|View details/ });
        await opener.focus(); await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog"); await dialog.waitFor();
        const primary = await dialog.evaluate((el) => getComputedStyle(el).getPropertyValue("--lp-primary").trim());
        await qaScreenshot(page, `${template}-390-product`);
        const violations = await qaA11y(page);
        await writeFile(path.join(qaOutput, `${template}-product-a11y.json`), JSON.stringify(violations, null, 2));
        await page.keyboard.press("Escape");
        const focused = await opener.evaluate((el) => el === document.activeElement);
        qaExpect(primary.toLowerCase() === state.variant.theme.primaryColor.toLowerCase(), "Product portal lost theme token", { primary, expected: state.variant.theme.primaryColor, focusRestored: focused });
        qaExpect(focused, "Product close did not restore opener focus");
        qaExpect(violations.length === 0, "Product dialog axe violations", violations);
      });
      if (state.variant.goal !== "SHOP" && await page.locator(".lp-catalog").count()) await qaCheck(`${template}-inquiry-contact`, "§4.2 details close before contact scroll/focus; non-SHOP has no purchase action", async () => {
        await qaCard(page).getByRole("button", { name: "View details", exact: true }).click();
        const dialog = page.getByRole("dialog");
        qaExpect(await dialog.getByRole("button", { name: "Add to cart", exact: true }).count() === 0, "Non-shop detail exposes purchase action");
        await dialog.getByRole("link", { name: "Contact us", exact: true }).click();
        qaExpect(await page.getByRole("dialog").count() === 0, "Inquiry contact action left dialog open");
        const focused = await page.evaluate(() => document.querySelector("#contact")?.contains(document.activeElement) || document.activeElement?.id === "contact");
        qaExpect(focused, "Contact destination did not receive focus");
      });
      if (state.variant.goal === "SHOP") {
        await page.keyboard.press("Escape");
        await qaAddPlain(page);
        await qaOpenCart(page);
        await qaCheck(`${template}-cart-theme-a11y`, "§4.3 themed cart portal and full-document accessibility", async () => {
          const dialog = page.getByRole("dialog");
          await qaScreenshot(page, `${template}-390-cart`);
          const primary = await dialog.evaluate((el) => getComputedStyle(el).getPropertyValue("--lp-primary").trim());
          const violations = await qaA11y(page);
          await writeFile(path.join(qaOutput, `${template}-cart-a11y.json`), JSON.stringify(violations, null, 2));
          qaExpect(primary.toLowerCase() === state.variant.theme.primaryColor.toLowerCase(), "Cart portal lost theme token", { primary });
          qaExpect(violations.length === 0, "Cart axe violations", violations);
        });
        await page.getByRole("button", { name: "Continue to checkout", exact: true }).click();
        await qaCheck(`${template}-checkout-theme`, "§4.3 themed viewport-aware checkout", async () => {
          await qaScreenshot(page, `${template}-390-checkout`);
          const dialog = page.getByRole("dialog");
          const primary = await dialog.evaluate((el) => getComputedStyle(el).getPropertyValue("--lp-primary").trim());
          const geometry = await dialog.boundingBox();
          qaExpect(primary.toLowerCase() === state.variant.theme.primaryColor.toLowerCase(), "Checkout lost theme token", { primary });
          qaExpect(geometry && geometry.y >= 0 && geometry.y + geometry.height <= 845, "Checkout exceeds visual viewport", geometry);
        });
      }
    });

    await qaCase(makeQaState(), { width: 320, height: 667 }, async ({ page }) => {
      await qaCheck("mobile-cart-bar-empty", "§4.3 cart bar only when items exist", async () => { qaExpect(await page.locator(".lp-public-cart-bar:visible").count() === 0, "Empty cart bar is visible"); });
      await qaAddPlain(page);
      await qaCheck("mobile-cart-bar-populated", "§4.3 compact bar has count/subtotal/action and reserved content space", async () => {
        const bar = page.locator(".lp-public-cart-bar"); qaExpect(await bar.isVisible(), "Expected compact public bottom cart bar");
        const text = await bar.innerText(); qaExpect(/1/.test(text) && /125/.test(text), "Cart bar omits count or subtotal", text);
        const geometry = await bar.boundingBox(); qaExpect(geometry && geometry.width >= 280 && geometry.y + geometry.height <= 668, "Cart bar geometry incorrect", geometry);
        return { text, geometry };
      });
      await qaOpenCart(page);
      await qaCheck("mobile-cart-readable", "§4.3 320px cart details above quantity; direct whole-line removal", async () => {
        await qaScreenshot(page, "boutique-320-cart");
        const name = page.getByRole("dialog").getByText(qaPlainName, { exact: true });
        const details = await name.boundingBox();
        const plus = await page.getByRole("button", { name: `Add one ${qaPlainName}`, exact: true }).boundingBox();
        const minus = await page.getByRole("button", { name: `Remove one ${qaPlainName}`, exact: true }).boundingBox();
        qaExpect(details && details.width >= 128, "Cart product text is unreadably narrow", { details, plus, minus });
        qaExpect(plus && details && plus.y >= details.y + details.height, "Quantity controls are not below product details", { details, plus });
        qaExpect(plus.width >= 44 && plus.height >= 44 && minus.width >= 44 && minus.height >= 44, "Quantity controls miss 44px touch target", { plus, minus });
        qaExpect(await page.getByRole("dialog").getByRole("button", { name: /^Remove (?!one )/ }).count() > 0, "No direct whole-line removal control");
        return { details, plus, minus };
      });
      await qaCheck("cart-bar-hidden-in-dialog", "§4.3 bottom bar hidden during public dialogs", async () => { qaExpect(await page.locator(".lp-public-cart-bar:visible").count() === 0, "Cart bar visible behind dialog"); });
      await qaCheck("dialog-close-touch-target", "§4.4 important close control at least 44px", async () => { const box = await page.getByRole("button", { name: "Close dialog", exact: true }).boundingBox(); qaExpect(box && box.width >= 44 && box.height >= 44, "Close target below 44px", box); return box; });
      await qaCheck("cart-direct-removal", "§4.3 whole-line removal works", async () => { await page.getByRole("dialog").getByRole("button", { name: /^Remove (?!one )/ }).first().click(); qaExpect(await page.getByRole("dialog").getByText(qaPlainName, { exact: true }).count() === 0, "Whole-line removal failed"); });
    });

    await qaCase(makeQaState(), {}, async ({ page, state }) => {
      await qaCheck("quantity-cap-announcement", "§4.1 and §4.3 rejected additions do not announce success", async () => {
        await qaCard(page).getByRole("button", { name: "Quick view", exact: true }).click();
        await page.getByLabel("Quantity", { exact: true }).fill("99");
        await page.getByRole("dialog").getByRole("button", { name: "Add to cart", exact: true }).click();
        // Change the live-region text first so this detects a real new success
        // announcement for the rejected add, rather than merely stale text.
        await qaCard(page, 4).getByRole("button", { name: "Add to cart", exact: true }).click();
        await qaCard(page).getByRole("button", { name: "Add to cart", exact: true }).click();
        const status = await page.locator(".lp-announcement").innerText();
        const stored = await page.evaluate(({ businessId, pageId }) => JSON.parse(localStorage.getItem(`miss-v-cart:${businessId}:${pageId}`) ?? "[]"), { businessId: state.businessId, pageId: state.pageId });
        qaExpect(stored[0]?.quantity === 99, "Cart cap must remain 99", stored);
        qaExpect(!status.includes(`${qaPlainName} added to cart`), "Rejected quantity-cap add announces success", { status, stored });
      });
      await qaCheck("saved-cart-isolation", "§4.3 tenant/page cart isolation", async () => {
        await page.reload(); await page.locator(".lp-storefront h1").waitFor();
        qaExpect(await page.getByRole("button", { name: "Open cart, 100 items", exact: true }).count() === 1, "Same-page cart not restored");
        state.pageId = "qa-page-002"; state.businessId = "qa-business-002";
        await page.reload(); await page.locator(".lp-storefront h1").waitFor();
        qaExpect(await page.getByRole("button", { name: "Open cart, 0 items", exact: true }).count() === 1, "Cart crossed business/page boundary");
      });
    });

    await qaCase(makeQaState(), { clock: true }, async ({ page, state }) => {
      await qaCheckout(page);
      await qaCheck("refresh-failure-retains-checkout", "§4.3 cached page and checkout input survive transient refresh failure", async () => {
        await qaRefresh(page, state, (value) => { value.status = 503; });
        await qaScreenshot(page, "refresh-failure-checkout");
        qaExpect(await page.locator(".lp-storefront h1").count() === 1, "Cached storefront unmounted on refresh failure");
        qaExpect(await page.getByLabel("Name", { exact: true }).inputValue() === "QA Customer Retained", "Checkout name lost");
        qaExpect(await page.getByLabel("Order notes (optional)", { exact: true }).inputValue() === "Retain these notes during refresh", "Checkout notes lost");
        qaExpect(await page.getByRole("button", { name: /Retry/i }).count() > 0, "No refresh Retry action");
      });
      await qaCheck("refresh-recovery-retains-input", "§4.3 successful retry restores cached page without lost input", async () => {
        state.status = 200;
        const retry = page.getByRole("button", { name: /Retry/i }).first();
        if (await retry.count()) await retry.click(); else await qaRefresh(page, state, () => {});
        await page.locator(".lp-storefront h1").waitFor();
        qaExpect(await page.getByLabel("Name", { exact: true }).inputValue() === "QA Customer Retained", "Checkout state not retained after recovery");
      });
    });

    await qaCase(makeQaState(), { clock: true }, async ({ page, state }) => {
      await qaCheckout(page);
      await page.getByRole("button", { name: "Delivery", exact: true }).click();
      await page.getByLabel("Delivery address", { exact: true }).fill("QA delivery address retained");
      await qaCheck("live-fulfillment-removal", "§4.3 removed fulfillment method reconciles with explanation and input retention", async () => {
        await qaRefresh(page, state, (value) => { value.variant.commerce.fulfillmentMethods = ["PICKUP"]; });
        const method = await page.locator('input[name="fulfillmentMethod"]').inputValue();
        const alerts = await page.locator('[role="alert"], [role="status"]').allTextContents();
        qaExpect(method === "PICKUP", "Removed Delivery method remains selected", { method, alerts });
        qaExpect(alerts.some((text) => /fulfillment|delivery|pickup|receive/i.test(text)), "Fulfillment change not explained", alerts);
        qaExpect(await page.getByLabel("Name", { exact: true }).inputValue() === "QA Customer Retained", "Fulfillment update lost input");
      });
      await qaCheck("no-valid-fulfillment", "§4.3 no valid fulfillment blocks submission with reason", async () => {
        await qaRefresh(page, state, (value) => { value.variant.commerce.fulfillmentMethods = []; });
        const review = page.getByRole("button", { name: "I reviewed the updated total", exact: true });
        if (await review.count()) await review.click();
        qaExpect(await page.getByRole("button", { name: "Place order", exact: true }).isDisabled(), "Submission enabled with no valid fulfillment");
        const text = await page.getByRole("dialog").innerText(); qaExpect(/no .*fulfillment|unavailable.*(delivery|pickup)|no .*method|cannot.*order/i.test(text), "No fulfillment explanation", text);
      });
    });

    await qaCase(makeQaState(), { clock: true }, async ({ page, state }) => {
      await page.getByRole("navigation", { name: "Collection categories" }).getByRole("button", { name: "Textiles", exact: true }).click();
      await qaCheck("live-category-removal", "§4.2 stale selected category reconciles on refreshed catalog", async () => {
        await qaRefresh(page, state, (value) => { value.catalog = value.catalog.map((item) => ({ ...item, category: "Harvest", categoryId: "qa-harvest" })); });
        qaExpect(await page.locator(".lp-product").count() > 0, "Removed category leaves empty stale filter");
        qaExpect(await page.getByRole("navigation", { name: "Collection categories" }).getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed") === "true", "Stale category not reset");
      });
    });

    for (const status of [503, 404]) {
      const state = makeQaState(); state.status = status;
      await qaCase(state, {}, async ({ page }) => {
        await qaCheck(`initial-${status}`, "§4.3 only actual 404 shows unpublished; transient initial error recoverable", async () => {
          if (status === 404) qaExpect(await page.getByText("This page is not published", { exact: true }).isVisible(), "404 missing unpublished view");
          else { qaExpect(await page.getByText("This page is not published", { exact: true }).count() === 0, "503 misreported as unpublished"); state.status = 200; await page.getByRole("button", { name: /Retry|Try again/i }).click(); await page.locator(".lp-storefront h1").waitFor(); }
        });
      });
    }

    await qaCase(makeQaState(), {}, async ({ page, state }) => {
      await qaCheckout(page);
      state.orderStatus = 503;
      await qaCheck("order-failure-retry-success", "§4.3 simulated failure/success preserve idempotency and input", async () => {
        await page.getByRole("button", { name: "Place order", exact: true }).click();
        await page.getByText("Simulated isolated order failure", { exact: true }).waitFor();
        qaExpect(await page.getByLabel("Name", { exact: true }).inputValue() === "QA Customer Retained", "Order failure discarded form");
        state.orderStatus = 200;
        await page.getByRole("button", { name: "Place order", exact: true }).click();
        await page.getByText("QA-ORDER-001", { exact: true }).waitFor();
        qaExpect(state.orders.length === 2 && state.orders[0].idempotencyKey === state.orders[1].idempotencyKey, "Retry changed order idempotency", state.orders);
        qaExpect(state.orders[1].items[0].quantity === 1 && state.orders[1].items[0].expectedUnitPrice === 125, "Order payload changed", state.orders[1]);
        await qaScreenshot(page, "order-success");
        return { requests: 2, idempotencyRetained: true };
      });
    });

    await qaCase(makeQaState(), { clock: true }, async ({ page, state }) => {
      await qaCheckout(page);
      await qaCheck("live-price-review", "§4.3 refreshed price requires review without discarded input", async () => {
        await qaRefresh(page, state, (value) => { value.catalog[0].price = 175; });
        qaExpect(await page.getByRole("button", { name: "Place order", exact: true }).isDisabled(), "Price changed without review");
        qaExpect(await page.getByLabel("Name", { exact: true }).inputValue() === "QA Customer Retained", "Price review discarded input");
        await page.getByRole("button", { name: "I reviewed the updated total", exact: true }).click();
        qaExpect(await page.getByRole("button", { name: "Place order", exact: true }).isEnabled(), "Reviewed price cannot proceed");
      });
      await qaCheck("live-unavailable-blocks-order", "§4.3 refreshed unavailable product blocks order", async () => {
        await qaRefresh(page, state, (value) => { value.catalog[0].isAvailable = false; });
        qaExpect(await page.getByRole("button", { name: "Place order", exact: true }).isDisabled(), "Unavailable item can be ordered");
      });
    });
  }

  if (["all", "media"].includes(qaOnly)) {
    await qaCase(makeQaState(), {}, async ({ page, state }) => {
      await qaCheck("stored-media-deferred", "§4.5 stored images below fold defer fetch until needed", async () => {
        await page.waitForTimeout(350);
        const before = [...new Set(state.imageRequests.map((item) => item.imageId))];
        qaExpect(!before.includes(qaStoredId(24)), "Below-fold stored image fetched at mount", { fetchedBeforeScroll: before.length, ids: before });
        await qaCard(page, 24).scrollIntoViewIfNeeded();
        await page.waitForFunction((id) => { const image = document.querySelector(`#product-${id} img`); return image?.naturalWidth > 0; }, qaStoredId(24));
        return { fetchedBeforeScroll: before.length, fetchedAfterScroll: new Set(state.imageRequests.map((item) => item.imageId)).size };
      });
      await qaCheck("stored-media-visible-load", "§4.5 loaded visible stored-image blobs; lazy offscreen blank is not a defect", async () => {
        await qaCard(page).scrollIntoViewIfNeeded();
        await page.waitForFunction((id) => { const image = document.querySelector(`#product-${id} img`); return image?.src.startsWith("blob:") && image.naturalWidth > 0; }, qaStoredId(1));
      });
    });
    const failed = makeQaState(); failed.imageFailures.add(qaStoredId(1));
    await qaCase(failed, {}, async ({ page, state }) => {
      await qaCheck("stored-media-recoverable-failure", "§4.5 exposed recoverable stored image failure", async () => {
        await qaCard(page).scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
        await qaScreenshot(page, "stored-image-failed");
        const card = qaCard(page); const retry = card.getByRole("button", { name: /retry|reload.*image|try.*image/i });
        qaExpect(await retry.count() > 0 || await card.locator('[data-image-state="error"], [data-image-failed="true"], .lp-image-failed').count() > 0, "Stored-image failure is silent");
        if (await retry.count()) { state.imageFailures.clear(); await retry.click(); await page.waitForFunction((id) => document.querySelector(`#product-${id} img`)?.naturalWidth > 0, qaStoredId(1)); }
      });
    });
    const privateState = makeQaState(); privateState.privateImageIds.add(qaStoredId(1));
    await qaCase(privateState, { token: true }, async ({ page, state }) => {
      await qaCheck("private-image-authorization", "§4.5 authenticated private stored image fallback preserved", async () => {
        await qaCard(page).scrollIntoViewIfNeeded(); await page.waitForFunction((id) => document.querySelector(`#product-${id} img`)?.naturalWidth > 0, qaStoredId(1));
        qaExpect(state.imageRequests.some((item) => item.imageId === qaStoredId(1) && !item.public && item.authorization === "Bearer isolated-fixture-token"), "Private fallback lost authorization");
      });
    });
    for (const template of ["architectural-escape", "farm-and-market"]) for (const missing of ["legacy", "failed"]) {
      const state = makeQaState(template, { revision: missing === "legacy" ? 1 : undefined });
      if (missing === "failed") { state.variant.theme.background = { mode: "IMAGE", color: "#F5F1EB", image: { url: `/api/images/${qaStoredId(99)}`, alt: "QA failed backdrop", focalPoint: { x: 0.5, y: 0.5 }, aspectRatio: "WIDE" } }; state.imageFailures.add(qaStoredId(99)); }
      await qaCase(state, {}, async ({ page }) => {
        await qaCheck(`${template}-${missing}-background-readable`, "§4.4 and §4.5 readable legacy/missing/failed hero fallback", async () => {
          await qaScreenshot(page, `${template}-${missing}-background`);
          const result = await page.locator(".lp-hero h1").evaluate((el) => {
            const rgb = (color) => [...color.matchAll(/[\d.]+/g)].map((match) => Number(match[0]));
            const luminance = (color) => rgb(color).slice(0, 3).map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
            let ancestor = el; let background = "rgb(255, 255, 255)";
            while (ancestor) { const candidate = getComputedStyle(ancestor).backgroundColor; if (candidate !== "rgba(0, 0, 0, 0)" && candidate !== "transparent") { background = candidate; break; } ancestor = ancestor.parentElement; }
            const color = getComputedStyle(el).color; const a = luminance(color); const b = luminance(background);
            return { color, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
          });
          qaExpect(result.ratio >= 3, "Hero fallback text contrast below 3:1", result); return result;
        });
      });
    }
    await qaCase(makeQaState("architectural-escape"), {}, async ({ page }) => {
      await qaCheck("reduced-motion-poster", "§4.4 preserve poster and reduced-motion compatibility", async () => {
        qaExpect(await page.locator(".lp-background canvas").count() === 0, "Reduced-motion page still starts 3D canvas");
        const image = page.locator(".lp-background img").first(); await image.waitFor();
        qaExpect(await image.evaluate((el) => el.naturalWidth > 0), "Reduced-motion poster failed to load");
      });
    });
  }
  if (["all", "extended"].includes(qaOnly)) {
    for (const goal of ["CATALOG", "INQUIRY"]) await qaCase(makeQaState("everyday-boutique", { goal }), {}, async ({ page }) => {
      await qaCheck(`${goal.toLowerCase()}-purchase-isolation`, "§4 preserve SHOP/CATALOG/INQUIRY semantics", async () => {
        qaExpect(await page.getByRole("button", { name: /^Open cart,/ }).count() === 0, "Non-SHOP header has cart");
        qaExpect(await qaCard(page).getByRole("button", { name: /Add to cart|Shop now|Choose options/ }).count() === 0, "Non-SHOP product has purchase action");
      });
      await qaCheck(`${goal.toLowerCase()}-details-to-contact`, "§4.2 inquiry/details closes and focuses contact destination", async () => {
        await qaCard(page).getByRole("button", { name: "View details", exact: true }).click();
        await page.getByRole("dialog").getByRole("link", { name: "Contact us", exact: true }).click();
        qaExpect(await page.getByRole("dialog").count() === 0, "Contact action left details dialog open");
        qaExpect(await page.evaluate(() => document.querySelector("#contact")?.contains(document.activeElement)), "Contact destination was not focused");
      });
    });
    await qaCase(makeQaState("editorial-studio"), {}, async ({ page }) => {
      await qaCheck("collection-rail-keyboard", "§4.2 bounded scrollable region has keyboard access and accessible name", async () => {
        const rail = page.getByRole("region", { name: "products", exact: true });
        await rail.focus(); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
        qaExpect(await rail.evaluate((el) => el === document.activeElement && el.scrollLeft > 0), "Named rail does not scroll from keyboard");
      });
    });
    for (const template of qaTemplateIds) {
      await qaCase(makeQaState(template, { empty: true }), { width: 320, height: 667 }, async ({ page }) => {
        await qaCheck(`${template}-empty-catalog`, "§6 empty catalog keeps public page and contact reachable", async () => {
          qaExpect(await page.locator(".lp-product").count() === 0, "Empty fixture has products");
          qaExpect(await page.locator("#contact").count() === 1, "Contact absent in empty fixture");
          qaExpect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Empty catalog page overflows");
          return { image: await qaScreenshot(page, `${template}-320-empty`) };
        });
      });
      const state = makeQaState(template, { longCopy: true });
      state.variant.sections.flatMap((section) => section.components).find((block) => block.type === "HEADER").content.brand = "A deliberately long merchant business name for responsive navigation and readable wrapping";
      await qaCase(state, { width: 320, height: 667 }, async ({ page }) => {
        await qaCheck(`${template}-long-copy-reflow`, "§6 long merchant title/brand naturally wraps without page overflow", async () => {
          await qaScreenshot(page, `${template}-320-long-copy`);
          const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, titleHeight: document.querySelector("h1").getBoundingClientRect().height }));
          qaExpect(result.scrollWidth <= result.width + 1, "Long merchant content overflows", result); return result;
        });
        await qaCheck(`${template}-200percent-text-reflow`, "§6 200% root-font enlargement simulation at 320px", async () => {
          await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
          await qaScreenshot(page, `${template}-320-text-200`);
          const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, rootFontSize: getComputedStyle(document.documentElement).fontSize }));
          qaExpect(result.scrollWidth <= result.width + 1, "Text enlargement causes page overflow", result); return result;
        });
      });
    }
    await qaCase(makeQaState("farm-and-market"), {}, async ({ page, state }) => {
      await qaAddPlain(page);
      await page.getByRole("button", { name: "Review and place order", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("QA Pending Customer");
      await page.getByLabel("Mobile number", { exact: true }).fill("09171234567");
      state.pendingOrder = true;
      await qaCheck("pending-order-rejects-add", "§4.1/4.3 pending submission cannot announce or accept additions", async () => {
        const requested = page.waitForRequest((request) => request.url().endsWith("/orders") && request.method() === "POST");
        await page.getByRole("button", { name: "Place order", exact: true }).click(); await requested;
        const add = qaCard(page, 4).getByRole("button", { name: "Add to cart", exact: true });
        if (await add.isEnabled()) await add.click();
        const notice = await page.locator(".lp-announcement").innerText();
        const stored = await page.evaluate(({ businessId, pageId }) => JSON.parse(localStorage.getItem(`miss-v-cart:${businessId}:${pageId}`) ?? "[]"), { businessId: state.businessId, pageId: state.pageId });
        qaExpect(stored.length === 1 && stored[0].quantity === 1, "Pending attempt changed submitted cart", stored);
        qaExpect(!notice.includes("Fixture product 04 added to cart"), "Rejected pending add announces success", { notice });
      });
      const settled = page.waitForResponse((response) => response.url().endsWith("/orders"));
      state.pendingRelease?.(); state.pendingOrder = false; await settled;
    });
    const heroState = makeQaState("bold-market");
    const hero = heroState.variant.sections.flatMap((section) => section.components).find((block) => block.type === "HERO");
    hero.content.layers = [];
    hero.content.media = { url: `/api/images/${qaStoredId(98)}`, mobileUrl: `/api/images/${qaStoredId(98)}`, alt: "QA stored hero", focalPoint: { x: 0.2, y: 0.7 }, aspectRatio: "WIDE" };
    heroState.variant.theme.background = { mode: "IMAGE", color: "#F5F1EB", image: { url: `/api/images/${qaStoredId(99)}`, alt: "QA stored background", focalPoint: { x: 0.7, y: 0.3 }, aspectRatio: "WIDE" } };
    await qaCase(heroState, {}, async ({ page, state }) => {
      await qaCheck("stored-hero-image-mode", "§4.5 eager primary stored hero, IMAGE mode, responsive source and focal point", async () => {
        await page.waitForFunction(() => [...document.querySelectorAll(".lp-main-image, .lp-hero .lp-background img")].every((img) => img.src.startsWith("blob:") && img.naturalWidth > 0));
        qaExpect(state.imageRequests.some((item) => item.imageId === qaStoredId(98)) && state.imageRequests.some((item) => item.imageId === qaStoredId(99)), "Primary stored media not eagerly loaded");
        const focal = await page.locator(".lp-main-image").evaluate((el) => getComputedStyle(el).objectPosition);
        qaExpect(focal === "20% 70%", "Hero focal point lost", focal);
        return { focal, image: await qaScreenshot(page, "stored-hero-image-mode") };
      });
    });
    await qaCase(makeQaState("architectural-escape"), { reducedMotion: "no-preference", width: 1440, height: 900 }, async ({ page }) => {
      await qaCheck("three-d-context-loss-poster", "§4.4 usable 3D canvas retains poster fallback after context loss", async () => {
        await page.waitForFunction(() => document.querySelector(".lp-background-canvas")?.style.opacity === "1", null, { timeout: 20000 });
        await page.locator(".lp-background canvas").evaluate((canvas) => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
        await page.waitForFunction(() => !document.querySelector(".lp-background canvas"));
        qaExpect(await page.locator(".lp-background img").first().evaluate((el) => el.naturalWidth > 0), "Context loss removed usable poster");
        return { image: await qaScreenshot(page, "three-d-context-loss-poster") };
      });
    });
  }
  await qaCheck("page-errors", "No runtime page errors across isolated scenarios", async () => { qaExpect(qaErrors.length === 0, "Runtime page errors", qaErrors); return qaErrors; });
  await qaCheck("api-isolation", "No unmatched API requests; no live API traffic/writes", async () => { const unexpected = qaTraffic.flatMap((item) => item.unexpectedApi); qaExpect(unexpected.length === 0, "Unexpected API route blocked", unexpected); return { sessions: qaTraffic.length, liveApiRequests: 0, simulatedOrders: qaTraffic.reduce((total, item) => total + item.orderBodies.length, 0) }; });
} finally {
  const sourceAfter = Object.fromEntries(await Promise.all(qaSourceFiles.map(async (name) => [name, createHash("sha256").update(await readFile(path.join(qaSourceRoot, name))).digest("hex")])));
  const result = { phase: qaPhase, started: qaStarted, finished: new Date().toISOString(), browser: qaBrowserName, browserVersion: qaBrowser.version(), availability: qaAvailability, url: qaUrl, sourceRoot: qaSourceRoot, sourceHashes: qaSourceHashes, sourceHashesAfter: sourceAfter, sourceChangedDuringRun: qaSourceFiles.filter((name) => qaSourceHashes[name] !== sourceAfter[name]), checks: qaChecks, totals: { pass: qaChecks.filter((item) => item.status === "PASS").length, fail: qaChecks.filter((item) => item.status === "FAIL").length, error: qaChecks.filter((item) => item.status === "ERROR").length }, pageErrors: qaErrors, traffic: qaTraffic };
  await writeFile(path.join(qaOutput, "verification.json"), JSON.stringify(result, null, 2));
  await qaBrowser.close();
  console.log(JSON.stringify({ output: qaOutput, ...result.totals, sourceChangedDuringRun: result.sourceChangedDuringRun }));
  if (result.totals.error > 0 || (qaPhase !== "baseline" && result.totals.fail > 0)) process.exitCode = 1;
}
