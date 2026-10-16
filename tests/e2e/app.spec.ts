import { expect, test } from "@playwright/test";

test("home provides clear songbook and service navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /gather with purpose/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /browse the songbook/i })).toHaveAttribute("href", "/songbook");
  await expect(page.getByRole("link", { name: /view services/i }).first()).toHaveAttribute("href", "/schedule");
});

test("sign-in page identifies the church and explains membership access", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText(/authorized church account/i)).toBeVisible();
  await expect(page.getByText(/limited to members provisioned/i)).toBeVisible();
});
