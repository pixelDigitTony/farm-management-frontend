import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("published catalog loads and preserves the cart after reload", async ({ page }) => {
  await page.goto("/site/test-farm");
  await expect(page.getByRole("heading", { name: "Test Farm", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /cart/i }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Farm product 1");
});

test("malformed stored cart does not crash the public page", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("miss-v-cart:test-farm", '{"invalid":true}'));
  await page.goto("/site/test-farm");
  await expect(page.getByRole("heading", { name: "Test Farm", exact: true })).toBeVisible();
});

test("owner can log in and reach inventory", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@example.test");
  await page.locator('input[name="password"]').fill("Test-owner-password-2026");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Inventory", exact: true, level: 2 })).toBeVisible();
  await expect(page.getByText("Test feed", { exact: true })).toBeVisible();
});

test("public landing page has no automated WCAG A/AA violations", async ({ page }) => {
  await page.goto("/site/test-farm");
  await expect(page.getByRole("heading", { name: "Test Farm", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations).toEqual([]);
});
