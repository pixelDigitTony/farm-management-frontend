import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createLandingPreset,
  landingTemplates,
} from "../../farm-management-backend/dist/services/landing-presets.js";

export const qaSlug = "qa-mobile-refinement";
export const qaPageId = "qa-page-001";
export const qaBusinessId = "qa-business-001";
export const qaStoredId = (number) => `507f1f77bcf86cd79943${String(number).padStart(4, "0")}`;
export const qaPlainName = "Handcrafted harvest selection with a deliberately long readable product name";
export const qaVariantName = "Indigo linen generous family selection with a deliberately long variant name";

export function makeQaCatalog() {
  return Array.from({ length: 30 }, (_, index) => {
    const sourceId = qaStoredId(index + 1);
    return {
      key: `PRODUCT:${sourceId}`,
      sourceType: "PRODUCT",
      sourceId,
      name: index === 0 ? qaPlainName : index === 1 ? "Choose your harvest style" : index === 2 ? "Seasonal selection" : `Fixture product ${String(index + 1).padStart(2, "0")}`,
      category: index === 1 ? "Textiles" : index % 2 === 0 ? "Harvest" : "Pantry",
      categoryId: index === 1 ? "qa-textiles" : index % 2 === 0 ? "qa-harvest" : "qa-pantry",
      productType: "OTHER",
      mediaUrls: [`/api/images/${sourceId}`],
      isAvailable: index !== 29,
      isFeatured: index < 3,
      effectiveActive: true,
      description: "Isolated regression fixture. This is test content, not a merchant claim.",
      price: index === 0 ? 125 : index === 1 ? 900 : 100 + index,
      variants: index === 1 ? [
        { variantId: "linen-indigo", name: qaVariantName, attributes: [{ name: "Material", value: "Linen" }, { name: "Color", value: "Indigo" }], price: 900, isAvailable: true },
        { variantId: "cheap-unavailable", name: "Unavailable sample size", attributes: [{ name: "Size", value: "Tiny" }], price: 1, isAvailable: false },
      ] : index === 2 ? [
        { variantId: "sold-out", name: "Temporarily sold out", attributes: [], price: 2, isAvailable: false },
      ] : [],
    };
  });
}

export function makeQaVariant(templateId, { catalog = makeQaCatalog(), revision, goal, longCopy = false, empty = false } = {}) {
  const definition = landingTemplates.find((template) => template.id === templateId);
  if (!definition) throw new Error(`Unknown fixture template ${templateId}`);
  const fixtureCatalog = empty ? [] : catalog;
  const preset = createLandingPreset(templateId, revision ?? definition.revision, goal ?? definition.goal, { businessName: "QA Demo Merchant" }, fixtureCatalog);
  const variant = { _id: `qa-variant-${templateId}`, ...preset };
  variant.commerce = { ...variant.commerce, minimumOrder: 0, deliveryFee: 25, fulfillmentMethods: ["PICKUP", "DELIVERY"] };
  for (const section of variant.sections) {
    for (const block of section.components) {
      // Presets intentionally select at most 24 references. This populated acceptance fixture
      // binds all 30 so Load more is actually tested; this does not change product defaults.
      if (block.type === "CATALOG") block.content.catalogItemRefs = fixtureCatalog.map(({ sourceType, sourceId }) => ({ sourceType, sourceId }));
      if (block.type === "HERO" && longCopy) {
        block.content.title = "A long merchant title that can expand naturally while every word and every essential action remains reachable";
        block.content.body = "Long merchant copy must flow without clipping. ".repeat(5);
      }
    }
  }
  return variant;
}

export function makeQaState(templateId = "everyday-boutique", options = {}) {
  const catalog = options.empty ? [] : makeQaCatalog();
  return {
    slug: qaSlug,
    pageId: qaPageId,
    businessId: qaBusinessId,
    catalog,
    variant: makeQaVariant(templateId, { ...options, catalog }),
    status: 200,
    orderStatus: 200,
    orderMessage: "Simulated isolated order failure",
    orderCode: undefined,
    pendingOrder: false,
    pendingRelease: null,
    imageFailures: new Set(),
    privateImageIds: new Set(),
    requests: [],
    orders: [],
    unexpectedApi: [],
    imageRequests: [],
    blockedExternal: [],
  };
}

export function qaResponse(state) {
  return {
    analyticsEnabled: false,
    pageId: state.pageId,
    businessId: state.businessId,
    slug: state.slug,
    siteTitle: "QA Demo Merchant",
    seoDescription: "Isolated mobile-refinement acceptance fixture",
    publishedAt: "2026-11-01T00:00:00.000Z",
    serverTime: new Date().toISOString(),
    variant: state.variant,
    catalogItems: state.catalog,
    menuItems: [],
  };
}

export async function installQaRoutes(context, state, origin) {
  const fixturePhoto = await readFile(fileURLToPath(new URL("../public/landing-assets/web/everyday-boutique/boutique-red-960.webp", import.meta.url)));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;
    const method = request.method();
    const apiPath = /^\/(?:api\/)?(public\/landing-pages|public\/images|images|auth|landing-page)(?:\/|$)/.test(path) || path.startsWith("/api/");
    const send = (json, status = 200) => route.fulfill({ json, status, headers: { "access-control-allow-origin": "*" } });
    if (/^(api\.iconify\.design|api\.simplesvg\.com|api\.unisvg\.com)$/.test(requestUrl.hostname)) {
      // Materialize icon SVGs locally so blocked third-party networking does not
      // shrink intrinsic icon-only button geometry and create a false target failure.
      const prefix = path.replace(/^\//, "").replace(/\.json$/, "");
      const icons = Object.fromEntries((requestUrl.searchParams.get("icons") ?? "").split(",").filter(Boolean).map((name) => [name, { body: '<path fill="currentColor" d="M4 4h16v16H4z"/>', width: 24, height: 24 }]));
      return send({ prefix, icons, width: 24, height: 24 });
    }
    if (apiPath) {
      state.requests.push({ path, method });
      const storedMatch = /\/(public\/)?images\/([a-f0-9]{24})$/.exec(path);
      if (storedMatch) {
        const [, publicPart, imageId] = storedMatch;
        state.imageRequests.push({ imageId, public: Boolean(publicPart), authorization: request.headers().authorization ?? null });
        if (state.imageFailures.has(imageId)) return send({ message: "Fixture image failed" }, 503);
        if (publicPart && state.privateImageIds.has(imageId)) return send({ message: "Fixture private image" }, 404);
        if (!publicPart && !request.headers().authorization) return send({ message: "Fixture requires authorization" }, 401);
        return route.fulfill({ body: fixturePhoto, contentType: "image/webp" });
      }
      if (/\/public\/landing-pages\/[^/]+$/.test(path) && method === "GET") {
        return state.status === 200 ? send(qaResponse(state)) : send({ message: state.status === 404 ? "Not found" : "Simulated page refresh failure" }, state.status);
      }
      if (/\/public\/landing-pages\/[^/]+\/orders$/.test(path) && method === "POST") {
        state.orders.push(request.postDataJSON());
        if (state.pendingOrder) await new Promise((resolve) => { state.pendingRelease = resolve; });
        return state.orderStatus === 200 ? send({ orderNumber: "QA-ORDER-001", status: "PENDING", total: 125 }) : send({ message: state.orderMessage, code: state.orderCode }, state.orderStatus);
      }
      if (/\/auth\/(me|refresh)$/.test(path)) return send({ message: "Anonymous isolated fixture" }, 401);
      // Fail closed: no API request ever reaches the real backend, including writes.
      state.unexpectedApi.push({ path, method });
      return send({ message: "Unmatched isolated QA API route" }, 501);
    }
    if (requestUrl.origin === origin) return route.continue();
    // Third-party network is blocked for deterministic, offline-safe evidence.
    state.blockedExternal.push(request.url());
    return route.abort("blockedbyclient");
  });
}

export const qaTemplateIds = landingTemplates.map((template) => template.id);
