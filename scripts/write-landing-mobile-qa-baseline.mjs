import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const qaReportRoot = fileURLToPath(new URL("../../", import.meta.url));
const qaDesignDir = path.join(qaReportRoot, "design/landing-mobile-refinement-2026-11-01");
const qaResult = JSON.parse(await readFile(path.join(qaDesignDir, "qa-baseline/verification.json"), "utf8"));
const qaExtendedResult = JSON.parse(await readFile(path.join(qaDesignDir, "qa-baseline-extended-final/verification.json"), "utf8"));
if (qaResult.sourceChangedDuringRun.length || qaExtendedResult.sourceChangedDuringRun.length || JSON.stringify(qaResult.sourceHashes) !== JSON.stringify(qaExtendedResult.sourceHashes)) throw new Error("Cannot combine baseline runs from different source hashes");
const qaExtendedChecks = new Map(qaExtendedResult.checks.map((check) => [check.id, check]));
qaResult.checks = qaResult.checks.map((check) => ({ ...qaExtendedChecks.get(check.id) ?? check, evidenceRun: qaExtendedChecks.has(check.id) ? "qa-baseline-extended-final" : "qa-baseline" }));
qaResult.totals = { pass: qaResult.checks.filter((check) => check.status === "PASS").length, fail: qaResult.checks.filter((check) => check.status === "FAIL").length, error: qaResult.checks.filter((check) => check.status === "ERROR").length };
qaResult.finished = qaExtendedResult.finished;
qaResult.runs = ["qa-baseline/verification.json", "qa-baseline-extended-final/verification.json"];
await writeFile(path.join(qaDesignDir, "qa-baseline/consolidated-verification.json"), JSON.stringify(qaResult, null, 2));
const qaFailures = qaResult.checks.filter((check) => check.status !== "PASS");
const qaGroup = (expression) => {
  const checks = qaResult.checks.filter((check) => expression.test(check.id));
  return `${checks.filter((check) => check.status === "PASS").length} pass / ${checks.filter((check) => check.status === "FAIL").length} fail${checks.some((check) => check.status === "ERROR") ? " / scenario error" : ""}`;
};
const qaEscape = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ").replaceAll("\r", "");
const qaReport = `# Independent QA — phase 0 baseline

Date: 2026-11-01 (Asia/Manila). Role: landing-qa. Scope: isolated verification only; no product fixes, deployments, database operations, or global configuration changes. Full SPEC.md and design brief read; no applicable AGENTS.md found in workspace or ancestor paths. No agents spawned.

**Phase 0 complete. This is a baseline, not implementation acceptance.** Corrected consolidated run: **${qaResult.totals.pass} pass, ${qaResult.totals.fail} fail, ${qaResult.totals.error ?? 0} scenario errors**. Browser: Chrome ${qaResult.browserVersion}; Node 26.9.0; Vite development server. Original-source snapshot hashes are unchanged during both runs and match each other. The lead's concurrent product changes are excluded from this snapshot.

## Evidence and provenance

- Frontend baseline: ca26df88d1c6850b3a0a0a23a1f0a5736a343b01.
- Backend preset baseline: 1d2bbb777b035730387ad3e5847fcbf4a863d80c. Preset JS and its imported validation/template/assets artifacts were newer than their source files before use; no backend rebuild or database connection was needed.
- Corrected run: ${qaResult.started} to ${qaResult.finished}.
- [Machine-readable consolidated checks and before/after SHA256](qa-baseline/consolidated-verification.json). Each check records its evidenceRun. Raw full-run traffic is in [the full run](qa-baseline/verification.json); corrected extended checks/traffic are in [the final extended rerun](qa-baseline-extended-final/verification.json).
- The final extended rerun fixes a harness serialization error when inspecting a pending request: only business/page IDs are passed into browser evaluation. The pending-add assertion then confirms a real false success announcement. Long-copy reflow is measured after visible image settlement; Farm long-copy overflow can vary before media settles, so the final settled measurement controls the verdict.
- [Exact fixture snapshot](qa-baseline/fixture-snapshot.json).
- [Original first run](qa-baseline/initial-verification.json) had 56 pass / 42 fail. It is superseded: the Boutique opening selector and initial-error settlement were harness defects. Initial icon target dimensions were also affected by blocked Iconify requests. Local shaped icon fixtures now preserve SVG sizing. Those first-run assertions must not be counted as product defects.
- Immutable frontend source archive and extracted files: qa-baseline-source/. Created with git archive at the baseline revision. node_modules and public are local junctions to installed dependencies/assets; this folder is a disposable local verification artifact, not a product change or deployment bundle. Its Vite cache is separate.

## Reusable harness and isolation contract

QA owns [verify-landing-mobile-refinement.mjs](../../farm-management-frontend/scripts/verify-landing-mobile-refinement.mjs), [landing-mobile-qa-fixtures.mjs](../../farm-management-frontend/scripts/landing-mobile-qa-fixtures.mjs), and this report generator. The runner collects findings instead of stopping at the first failed acceptance assertion. Baseline mode intentionally exits zero for known product failures; acceptance mode exits nonzero for failed checks. Scenario errors always exit nonzero. Never interpret baseline exit zero as a pass verdict.

All API traffic is fulfilled or failed closed before navigation. Unexpected API paths return a fixture 501 and fail the isolation assertion. All order POSTs are simulated inside Playwright; no real API write reaches a backend. Third-party traffic is blocked; Iconify JSON is synthesized locally to retain actual icon box dimensions. Service workers are blocked. Pricing, stock, refresh failures, pending requests and settings changes are test-controlled.

Fixture slug qa-mobile-refinement; pageId qa-page-001; businessId qa-business-001. There are 30 catalog items with PRODUCT:<sourceId> keys. IDs run from 507f1f77bcf86cd799430001 through ...0030; the first has a long plain product name, the second an available Indigo/Linen variant at ₱900 and an unavailable ₱1 variant, the third has no available variants, and the thirtieth is unavailable. Every rendered catalog reference matches its key. The fixture explicitly binds all 30 refs because new-preset default seeding intentionally caps refs at 24. This exercises renderer load-more behavior without mischaracterizing default seeding. Stored media uses /api/images/<24hex>, with simulated public, failed, and authenticated private responses. Repeated test photography is intentional.

Screenshots are viewport captures of hero, catalog/offerings and footer at all seven widths, plus navigation, details, cart and checkout where the preset supports them. Architectural Escape defaults to INQUIRY with a showcase, so its offerings are captured rather than inventing a catalog. The separate non-SHOP detail fixture tests modal inquiry/contact behavior. Visible images are allowed to load before capture; offscreen lazy images are never declared defective merely because they are blank.

## Acceptance matrix

| Requirement / SPEC reference | Baseline coverage and result |
| --- | --- |
| Five designs × 320, 360, 390, 430, 704, 768, 1440 (§6) | ${qaGroup(/-\d+-reflow$/)}; 35 combinations captured. Standard copies and long catalog names. |
| Standard primary action visible at 390×844 (§4.4) | ${qaGroup(/-primary-action-in-opening$/)}. Boutique selector corrected. 320px is tested for reflow; spec allows natural vertical growth. |
| Boutique 704 composition (§4.4) | ${qaGroup(/^boutique-704/)}; four photo elements exist, but cards remain one column at 668px instead of two compact columns. |
| Full-document WCAG automated checks (§6) | ${qaGroup(/-document-a11y$/)}. Axe scans include the document; dialog scans and portal JSON are also saved. A zero automated result does not prove manual contrast/focus/target compliance. |
| Navigation/product focus and theme (§4.1–4.2) | ${qaGroup(/-(navigation|details)-focus-theme$/)}. Closing surfaces records whether opener focus is restored; missing theme and focus failures are detailed below. |
| Cart/checkout portal theme (§4.3) | ${qaGroup(/-(cart-theme-a11y|checkout-theme)$/)}. Product/cart a11y JSON files are retained separately even when the theme assertion fails first. |
| 320px mobile cart/bar/removal/targets (§4.3–4.4) | ${qaGroup(/^(mobile-cart|cart-bar|cart-direct|dialog-close)/)}. Exact text/control geometry and captures recorded. Empty/hidden-bar passes are insufficient until the populated-bar test also passes. |
| Catalog refs, pagination, min price, variants and clear filters (§4.2) | ${qaGroup(/^(fixture-integrity|catalog-load-more|available-minimum-price|all-variants-unavailable|variant-search|clear-both-filters)$/)}. 24→30 pagination, availability-aware prices and variant attributes exercised. |
| Add rejection and pending submission (§4.1/4.3) | ${qaGroup(/^(quantity-cap-announcement|pending-order-rejects-add)$/)}. Cap test changes the live-region text with another accepted product before rejecting the capped item, detecting a new false success announcement. |
| Cart persistence and business/page isolation (§4.3) | ${qaGroup(/^saved-cart-isolation$/)}. Same page reload and changed business/page IDs exercised. Reload persistence of unresolved order attempts remains explicitly out of scope. |
| Transient refresh during checkout and recovery (§4.3) | ${qaGroup(/^refresh-/)}. Name, email, phone and notes filled; cached content/input/Retry retention asserted. |
| Fulfillment removal/no valid method (§4.3) | ${qaGroup(/^(live-fulfillment-removal|no-valid-fulfillment)$/)}. Delivery removed, then no methods; price review acknowledged before testing no-method submission block. |
| Category refresh reconciliation (§4.2) | ${qaGroup(/^live-category-removal$/)}. Selected Textiles category removed by refresh. |
| Initial error classification (§4.3) | ${qaGroup(/^initial-/)}. Settled 503 and actual 404 distinguished. |
| Order failure/retry/success, price/stock safeguards (§4.3) | ${qaGroup(/^(order-failure-retry-success|live-price-review|live-unavailable-blocks-order)$/)}. Simulated payload and stable retry idempotency checked. |
| Stored-media defer/load/failure/auth and eager hero (§4.5) | ${qaGroup(/^(stored-|private-image-)/)}. Below-fold request count, visible blob load, failure exposure, private authorization, IMAGE mode and focal point checked. |
| Legacy/failed Architectural and Farm backgrounds (§4.4–4.5) | ${qaGroup(/-background-readable$/)}. Large hero text contrast measured against the effective flat fallback surface; screenshots retained. |
| Reduced-motion and 3D/poster behavior (§4.4) | ${qaGroup(/^(reduced-motion-poster|three-d-context-loss-poster)$/)}. Reduced-motion poster and rendered-canvas context loss exercised. |
| SHOP/CATALOG/INQUIRY and keyboard rail (§4.2) | ${qaGroup(/^(catalog-purchase|catalog-details|inquiry-|collection-rail)/)}. Non-SHOP purchase controls and details→contact semantics checked independently of default Escape composition. |
| Empty/long merchant copy and 200% text (§6) | ${qaGroup(/-(empty-catalog|long-copy-reflow|200percent-text-reflow)$/)}. 320px across all five, including CSS root-font enlargement simulation. Physical browser zoom/manual text inspection remains separate. |
| Runtime errors and API isolation | ${qaGroup(/^(page-errors|api-isolation)$/)}. All matched/mismatched traffic retained in JSON. |

## Exact failed assertions

The following are the corrected run's observed failures. Each ID maps to its full error and evidence in verification.json; timeout failures on missing controls identify the expected control in the locator log. These are baseline findings for the implementation owners, not QA product edits.

| Check ID | Result | Exact failure |
| --- | --- | --- |
${qaFailures.map((check) => "| " + check.id + " | " + check.status + " | " + qaEscape(check.error) + " |").join("\n")}

## Commands and continuation

From farm-management-frontend, use installed Node 26 (the shell default is Node 20):

    & 'C:\\Users\\USER\\AppData\\Roaming\\nvm\\v26.9.0\\node.exe' scripts/verify-landing-mobile-refinement.mjs --phase acceptance --url http://127.0.0.1:4182

Start the current frontend with Vite on the same URL first. For a corrected historical baseline, serve design/landing-mobile-refinement-2026-11-01/qa-baseline-source on4181 using the installed frontend Vite executable, then pass --phase baseline --url http://127.0.0.1:4181 --source-root design/landing-mobile-refinement-2026-11-01/qa-baseline-source. --only responsive|functional|media|extended supports targeted reruns; use a distinct --output design/.../<run-name> to retain prior evidence. --browser firefox|webkit selects another installed Playwright engine. Preserve the baseline folder during implementation acceptance.

## Remaining acceptance and harness gaps

- Firefox and WebKit binaries are not installed at the Playwright-resolved locations recorded in JSON. Only installed Chrome was run. No downloads/providers were installed for phase0.
- Physical iPhone/Android: software keyboard, safe areas, landscape and dynamic browser toolbars remain unverified. Desktop viewport/text simulation is not device acceptance.
- Production-build mobile performance (three cold runs, recorded throttling, median LCP≤2.5s/CLS≤0.1) and field INP≤200ms p75 remain unmeasured. This baseline used Vite development output and does not establish production performance.
- Manual assistive-technology, actual 200% browser zoom, image-region contrast and visual review of every capture remain for phase3 QA/designer. Automated contrast and geometry checks are bounded evidence.
- Interactive preview/editor parity, legacy schema-v1 renderer behavior and admin-dialog styling isolation are not exercised by this new public harness. Run existing landing-v2/editor regressions and relevant focused tests after integration; QA does not claim those passes from an older run.
- Default-only copy/link seeding, preservation of authored snapshots, variant removal while details is open, partial accepted additions at the cap, direct product→cart focus transfer, responsive source cancellation/duplicate in-flight request counts and all network/model failure permutations need additional focused integration checks. Current checks cover related public behavior but not these complete contracts.
- Frontend/backend builds/type checks and changed-owner unit tests belong to the integrated revision. Phase0 did not modify application code and did not run unrelated broad suites.

The lead was notified that the original capture is frozen and the product-file hold is released. Final functional and designer acceptance must target the same integrated revision. No deployment/publication is authorized or claimed.
`;
await writeFile(path.join(qaDesignDir, "QA-BASELINE.md"), qaReport);
console.log(JSON.stringify({ report: path.join(qaDesignDir, "QA-BASELINE.md"), totals: qaResult.totals }));
