import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { Launcher, launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import {
  createLandingPreset,
  landingTemplates,
} from "../../farm-management-backend/dist/services/landing-presets.js";

// Build separately with VITE_API_URL=/api. No live API, merchant data or orders are used.
const output = path.resolve("test-results/landing-v2/lighthouse");
const root = path.resolve("test-results/landing-v2/lighthouse-dist");
if (process.platform === "win32")
  process.env.PATH = `${process.env.PATH}${path.delimiter}${path.join(process.env.SystemRoot ?? "C:/Windows", "System32")}`;
await mkdir(output, { recursive: true });
await readFile(path.join(root, "index.html"));
const documents = new Map(
  landingTemplates.map((template) => [
    template.id,
    createLandingPreset(
      template.id,
      template.revision,
      "INQUIRY",
      { businessName: "Template performance review" },
      [],
    ),
  ]),
);
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const id = pathname.split("/").at(-1);
    if (pathname.startsWith("/api/public/landing-pages/") && documents.has(id)) {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Cache-Control": "no-store",
      });
      response.end(
        gzipSync(
          JSON.stringify({
            slug: id,
            siteTitle: "Template performance review",
            seoDescription: "Explore editable collections and discover more about this business.",
            variant: documents.get(id),
            catalogItems: [],
            menuItems: [],
            serverTime: new Date().toISOString(),
          }),
        ),
      );
      return;
    }
    if (pathname.startsWith("/api/")) {
      response.writeHead(404);
      response.end();
      return;
    }
    const file = path.resolve(
      root,
      pathname.startsWith("/site/") ? "index.html" : `.${decodeURIComponent(pathname)}`,
    );
    assert.ok(file.startsWith(`${root}${path.sep}`));
    const mime =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".wasm": "application/wasm",
        ".glb": "model/gltf-binary",
      }[path.extname(file)] ?? "application/octet-stream";
    const compressed = /text\/|application\/json/.test(mime);
    const data = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000",
      ...(compressed ? { "Content-Encoding": "gzip" } : {}),
    });
    response.end(compressed ? gzipSync(data) : data);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const chrome = await launch({
  chromePath: Launcher.getInstallations()[0],
  chromeFlags: ["--headless=new", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
});
const results = [];
try {
  for (const profile of ["mobile", "desktop"])
    for (const template of landingTemplates) {
      const address = `http://127.0.0.1:${server.address().port}/site/${template.id}`;
      const result = await lighthouse(
        address,
        { port: chrome.port, output: ["json", "html"], logLevel: "error" },
        profile === "desktop" ? desktopConfig : undefined,
      );
      assert.ok(result?.lhr && !result.lhr.runtimeError, JSON.stringify(result?.lhr.runtimeError));
      const lhr = result.lhr;
      assert.equal(lhr.configSettings.formFactor, profile);
      await writeFile(path.join(output, `${template.id}-${profile}.json`), result.report[0]);
      await writeFile(path.join(output, `${template.id}-${profile}.html`), result.report[1]);
      const entry = {
        template: template.id,
        profile,
        performance: lhr.categories.performance.score,
        accessibility: lhr.categories.accessibility.score,
        lcpMs: lhr.audits["largest-contentful-paint"].numericValue,
        cls: lhr.audits["cumulative-layout-shift"].numericValue,
        tbtMs: lhr.audits["total-blocking-time"].numericValue,
        issues: Object.values(lhr.audits)
          .filter(
            (audit) =>
              audit.score !== null && audit.score < 0.9 && audit.scoreDisplayMode !== "informative",
          )
          .map((audit) => ({ id: audit.id, title: audit.title, value: audit.displayValue })),
      };
      results.push(entry);
      console.log(JSON.stringify(entry));
      await writeFile(
        path.join(output, "summary.json"),
        JSON.stringify(
          {
            scope:
              "One lab run per template/profile; local production build with gzip and isolated empty-catalog API fixtures. Software-rendered desktop 3D. Not field Web Vitals or merchant-media performance.",
            results,
          },
          null,
          2,
        ),
      );
    }
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await chrome.kill();
  await new Promise((resolve) => server.close(resolve));
}
