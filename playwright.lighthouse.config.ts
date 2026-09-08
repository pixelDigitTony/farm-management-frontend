import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Reuse the disposable API and production preview lifecycle, never a development server.
export default defineConfig({
  ...base,
  testDir: "./tests/performance",
  testMatch: "lighthouse.spec.ts",
  timeout: 600_000,
  projects: [{ name: "lighthouse" }],
});
