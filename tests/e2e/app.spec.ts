import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const disposablePublicContentDatabase = process.env.E2E_TEST_DATABASE === "disposable"
  && Boolean(supabaseUrl)
  && !supabaseUrl?.includes("ckgnhsnqeabowkctvdqj");

test("home presents exactly three clear destinations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Worship together." })).toBeVisible();
  const options = page.locator(".home-options > a");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText("Songs");
  await expect(options.nth(0)).toHaveAttribute("href", "/song");
  await expect(options.nth(1)).toContainText("Sunday Schedule");
  await expect(options.nth(1)).toHaveAttribute("href", "/schedule");
  await expect(options.nth(2)).toContainText("Slides");
  await expect(options.nth(2)).toHaveAttribute("href", "/slides");
  const primaryNavigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(primaryNavigation.getByRole("link")).toHaveCount(2);
  await expect(primaryNavigation.getByRole("link", { name: "Songbook" })).toHaveAttribute("href", "/song");
  await expect(primaryNavigation.getByRole("link", { name: "Schedule" })).toHaveAttribute("href", "/schedule");
  await expect(primaryNavigation.getByRole("link", { name: "Slides" })).toHaveCount(0);
});

test("homepage layout fits mobile, tablet, and laptop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.locator(".home-options > a")).toHaveCount(3);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow, `horizontal overflow at ${width}px`).toBe(false);
  }
});

test("public content routes remain reachable without authentication controls", async ({ page }) => {
  for (const path of ["/song", "/schedule", "/slides"]) {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByRole("button", { name: /sign in|sign out/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /sign in|sign out/i })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.locator(".page-main")).toBeVisible();
  }
});

test("the custom cross icon is served", async ({ request }) => {
  const response = await request.get("/incoc-mark.svg");
  expect(response.ok()).toBeTruthy();
  const icon = await response.text();
  expect(icon).toContain('fill="#090909"');
  expect(icon).toContain('fill="#fff"');
});

test("sign-in page identifies the church and explains membership access", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("Sign-in is restricted to the website owner.")).toBeVisible();
  await expect(page.getByText(/available without signing in/i)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("public content routes do not require sign-in", async ({ page }) => {
  test.skip(!disposablePublicContentDatabase, "Use a non-production disposable Supabase test database.");
  for (const [path, heading] of [
    ["/song", "Songbook"],
    ["/schedule", "Sunday Schedule"],
    ["/slides", "Slides"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("anonymous visitor can open a published service and navigate its slides", async ({ page }) => {
  test.skip(!disposablePublicContentDatabase, "Use a non-production disposable Supabase test database.");
  await page.goto("/slides");
  const serviceLink = page.locator(".result-card").first();
  await expect.poll(async () => (
    await serviceLink.count() > 0 || await page.getByText("There are no presentations yet.").count() > 0
  ), { timeout: 60_000 }).toBe(true);
  test.skip(await serviceLink.count() === 0, "Add a published service to the disposable database.");
  await serviceLink.click();
  const slideCard = page.locator(".slides-preview-card").first();
  await expect.poll(async () => (
    await slideCard.count() > 0 || await page.getByText("There are no presentation slides for this service.").count() > 0
  ), { timeout: 60_000 }).toBe(true);
  test.skip(await slideCard.count() === 0, "Add a presentation item to the published service.");
  await slideCard.click();
  await expect(page).toHaveURL(/\/present\/[0-9a-f-]{36}/i);
  const counter = page.locator(".presentation-slide-counter");
  await expect(counter).toContainText(/^1 \/ \d+$/);
  const slideCount = Number((await counter.innerText()).split("/")[1]?.trim());
  if (slideCount > 1) {
    await page.keyboard.press("ArrowRight");
    await expect(counter).toContainText(/^2 \/ \d+$/);
  }
});

test("unauthenticated visitors cannot open owner pages", async ({ page }) => {
  test.setTimeout(60_000);
  const protectedPaths = [
    "/admin",
    "/admin/songs",
    "/admin/songs/new",
    "/admin/schedules",
    "/admin/members",
    "/admin/settings",
  ];

  for (const path of protectedPaths) {
    await page.goto(path);
    const accessState = page.getByText(/unavailable until Supabase is configured|configured Supabase project|access is not configured|after Supabase is configured/i);
    await expect.poll(async () => {
      if (new URL(page.url()).pathname === "/login") return "login";
      return (await accessState.count()) ? "configuration-notice" : "pending";
    }, { timeout: 15_000 }).not.toBe("pending");
    await expect(page.getByRole("heading", { name: "Welcome to INCOC South" })).toHaveCount(0);

    if (new URL(page.url()).pathname === "/login") {
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      continue;
    }
    await expect(accessState).toBeVisible();
  }
});

test("unknown public schedule and presentation IDs return not found", async ({ page }) => {
  test.skip(!disposablePublicContentDatabase, "Set E2E_TEST_DATABASE=disposable only for a non-production test database with the public-content migration applied.");
  const randomId = "00000000-0000-0000-0000-000000000001";
  await page.goto(`/schedule/${randomId}`);
  await expect(page.getByText("This service is not available.")).toBeVisible();
  await page.goto(`/present/${randomId}`);
  await expect(page.getByText("This presentation is not available.")).toBeVisible();
  await page.goto(`/schedule/${randomId}/slides`);
  await expect(page).toHaveURL(/\/slides$/);
  await expect(page.getByRole("heading", { name: "Slides" })).toBeVisible();
});
