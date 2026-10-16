import { expect, test } from "@playwright/test";

test("home presents exactly three clear destinations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Worship together." })).toBeVisible();
  const options = page.locator(".home-options > a");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText("Songs");
  await expect(options.nth(0)).toHaveAttribute("href", "/songbook");
  await expect(options.nth(1)).toContainText("Sunday Schedule");
  await expect(options.nth(1)).toHaveAttribute("href", "/schedule");
  await expect(options.nth(2)).toContainText("Slides");
  await expect(options.nth(2)).toHaveAttribute("href", "/schedule");
});

test("the cross favicon serves the custom dark icon", async ({ request }) => {
  const response = await request.get("/incoc-mark.svg");
  expect(response.ok()).toBeTruthy();
  const icon = await response.text();
  expect(icon).toContain('fill="#090909"');
  expect(icon).toContain('fill="#fff"');

  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBeTruthy();
  expect([...(await favicon.body()).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
});

test("sign-in page identifies the church and explains membership access", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(9, 9, 9)");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText(/authorized church account/i)).toBeVisible();
  await expect(page.getByText(/limited to members provisioned/i)).toBeVisible();
});

test("unauthenticated visitors cannot open member or owner pages", async ({ page }) => {
  test.setTimeout(60_000);
  const protectedPaths = [
    "/songbook",
    "/schedule",
    "/admin",
    "/admin/songs/new",
    "/schedule/00000000-0000-0000-0000-000000000001",
    "/present/00000000-0000-0000-0000-000000000001",
  ];

  for (const path of protectedPaths) {
    await page.goto(path);
    const accessState = page.getByText(/unavailable until Supabase is configured|configured Supabase project|access is not configured|after Supabase is configured/i);
    await expect.poll(async () => {
      if (new URL(page.url()).pathname === "/login") return "login";
      return (await accessState.count()) ? "configuration-notice" : "pending";
    }, { timeout: 15_000 }).not.toBe("pending");

    if (new URL(page.url()).pathname === "/login") {
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      continue;
    }
    await expect(accessState).toBeVisible();
  }
});
