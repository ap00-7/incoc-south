import { expect, test } from "@playwright/test";

const localPublicContentMock = process.env.E2E_PUBLIC_CONTENT_MOCK === "1"
  && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const disposablePublicContentDatabase = process.env.E2E_TEST_DATABASE === "disposable"
  && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("ckgnhsnqeabowkctvdqj");
const publicContentTestsEnabled = localPublicContentMock || disposablePublicContentDatabase;

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
  await expect(options.nth(2)).toHaveAttribute("href", "/slides");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
});

test("homepage layout fits mobile, tablet, and laptop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    await expect(page.locator(".home-options > a")).toHaveCount(3);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow, `horizontal overflow at ${width}px`).toBe(false);
  }
});

test("public content routes remain directly reachable without a global navigation bar", async ({ page }) => {
  for (const path of ["/songbook", "/schedule", "/slides"]) {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator(".site-header .brand")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    await expect(page.locator(".page-main")).toBeVisible();
  }
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
  await expect(page.getByText("Sign-in is restricted to the website owner.")).toBeVisible();
  await expect(page.getByText(/available without signing in/i)).toBeVisible();
});

test("public content routes do not require sign-in", async ({ page }) => {
  test.skip(!publicContentTestsEnabled, "Use a local Supabase API mock or a non-production disposable test database.");
  for (const [path, heading] of [
    ["/songbook", "Songs for worship"],
    ["/schedule", "Gather together"],
    ["/slides", "Choose a presentation"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("anonymous visitor can open a published service and navigate its slides", async ({ page }) => {
  test.skip(!publicContentTestsEnabled, "Use a local Supabase API mock or a non-production disposable test database.");
  const scheduleTitle = "Fixture Sunday Service";
  const scheduleId = "66000000-0000-0000-0000-000000000001";
  await page.goto("/schedule");
  await expect(page.getByRole("link", { name: new RegExp(scheduleTitle) })).toHaveAttribute("href", `/schedule/${scheduleId}`);
  await page.goto(`/schedule/${scheduleId}`);
  await expect(page.getByRole("heading", { name: scheduleTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fixture Song" })).toBeVisible();
  await page.getByRole("link", { name: "Open slides" }).click();
  await expect(page.locator(".preview-card")).toHaveCount(2);
  await page.getByRole("link", { name: "Present service" }).click();
  const controls = page.locator(".presentation-controls");
  await expect(controls).toContainText("Slide 1 / 2");
  await page.keyboard.press("ArrowRight");
  await expect(controls).toContainText("Slide 2 / 2");
  await expect(page.locator(".slide-lyrics")).toContainText("Final public slide line");
});

test("unauthenticated visitors cannot open owner pages", async ({ page }) => {
  test.setTimeout(60_000);
  const protectedPaths = [
    "/admin",
    "/admin/songs",
    "/admin/songs/new",
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

test("unknown public schedule and presentation IDs return not found", async ({ page }) => {
  test.skip(!disposablePublicContentDatabase, "Set E2E_TEST_DATABASE=disposable only for a non-production test database with the public-content migration applied.");
  const randomId = "00000000-0000-0000-0000-000000000001";
  for (const path of [`/schedule/${randomId}`, `/schedule/${randomId}/slides`, `/present/${randomId}`]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  }
});
