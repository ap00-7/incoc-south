import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const disposablePublicContentDatabase = process.env.E2E_TEST_DATABASE === "disposable"
  && Boolean(supabaseUrl)
  && !supabaseUrl?.includes("ckgnhsnqeabowkctvdqj");

test("About page explains the app and keeps header navigation focused", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "About INCOC South" })).toBeVisible();
  await expect(page.getByText(/digital platform for the Indian Church of Christ/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Worship Songbook" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sunday Schedule" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Presentation Slides" })).toBeVisible();
  await expect(page.getByText(/supports organized worship and Sunday service preparation/i)).toBeVisible();
  const primaryNavigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(primaryNavigation.getByRole("link")).toHaveCount(2);
  await expect(primaryNavigation.getByRole("link", { name: "Songbook" })).toHaveAttribute("href", "/songs");
  await expect(primaryNavigation.getByRole("link", { name: "Schedule" })).toHaveAttribute("href", "/schedule");
  await expect(primaryNavigation.getByRole("link", { name: "Slides" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /theme/i })).toHaveCount(0);
});

test("About page and feature grid fit mobile, tablet, and laptop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [320, 375, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.locator(".about-feature-card")).toHaveCount(3);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow, `horizontal overflow at ${width}px`).toBe(false);
  }
});

test("public and owner route shells avoid horizontal overflow across viewport sizes", async ({ page }) => {
  test.setTimeout(90_000);
  const routes = [
    "/",
    "/songs",
    "/songs/00000000-0000-0000-0000-000000000001",
    "/schedule",
    "/schedule/00000000-0000-0000-0000-000000000001",
    "/slides",
    "/present/00000000-0000-0000-0000-000000000001",
    "/admin",
    "/admin/announcements",
    "/admin/schedules/new",
  ];
  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    for (const width of [320, 375, 430, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.scrollWidth, `${route} overflow at ${width}px`).toBeLessThanOrEqual(dimensions.clientWidth);
    }
  }
});

test("theme follows the system preference without a manual switcher", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("html");
  await expect(page.getByRole("button", { name: /theme/i })).toHaveCount(0);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveCSS("color-scheme", "dark");
  await expect.poll(() => root.evaluate((element) => getComputedStyle(element).getPropertyValue("--paper").trim())).toBe("#0b0b0a");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(root).toHaveCSS("color-scheme", "light");
  await expect.poll(() => root.evaluate((element) => getComputedStyle(element).getPropertyValue("--paper").trim())).toBe("#faf8f4");
});

test("public pages contain no owner authentication controls or footer", async ({ page }) => {
  for (const path of ["/", "/songs", "/schedule", "/slides", "/announcement", "/announcement/slides"]) {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
    await expect(page.locator(".site-footer")).toHaveCount(0);
    if (path !== "/") {
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
      await expect(page.locator(".site-header")).toHaveCount(0);
      await expect(page.locator(".page-main")).toBeVisible();
    }
  }

  await page.goto("/songs/00000000-0000-0000-0000-000000000001");
  await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
  await page.goto("/schedule/00000000-0000-0000-0000-000000000001");
  await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
});

test("custom dropdown supports keyboard selection and stays inside the viewport", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 240 });
  await page.goto("/tests/fixtures/dropdown.html");
  const languageDropdown = page.getByRole("combobox", { name: "Language" });
  await expect(languageDropdown).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await languageDropdown.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toHaveCSS("background-color", "rgb(23, 21, 18)");
  const menuBounds = await listbox.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(menuBounds.left).toBeGreaterThanOrEqual(0);
  expect(menuBounds.right).toBeLessThanOrEqual(viewport.width);
  expect(menuBounds.top).toBeGreaterThanOrEqual(0);
  expect(menuBounds.bottom).toBeLessThanOrEqual(viewport.height);

  await languageDropdown.focus();
  await languageDropdown.press("ArrowDown");
  await languageDropdown.press("Enter");
  await expect(page.getByTestId("selected-language")).toHaveText("English");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  await languageDropdown.focus();
  await languageDropdown.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await languageDropdown.press("End");
  await languageDropdown.press("Enter");
  await expect(page.getByTestId("selected-language")).toHaveText("Tamil");
  await languageDropdown.click();
  await page.getByRole("button", { name: "Outside menu" }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("main navigation is home-only across direct visits and browser history", async ({ page }) => {
  await page.goto("/songs");
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "Songbook" }).click();
  await expect(page).toHaveURL(/\/songs$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(page.locator(".site-header")).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Schedule" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/songs$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL("/");
  await page.goForward();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);

  const routes = [
    "/songs",
    "/songs/00000000-0000-0000-0000-000000000001",
    "/songbook/00000000-0000-0000-0000-000000000001",
    "/schedule",
    "/schedule/00000000-0000-0000-0000-000000000001",
    "/schedule/00000000-0000-0000-0000-000000000001/slides",
    "/slides",
    "/slides?scheduleId=00000000-0000-0000-0000-000000000001",
    "/present/00000000-0000-0000-0000-000000000001",
  ];
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.ok(), route).toBe(true);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    await expect(page.locator(".site-header")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    await expect(page.locator(".site-header")).toHaveCount(0);
  }
});

test("legacy song routes redirect to /songs and preserve IDs and query parameters", async ({ page }) => {
  await page.goto("/song?create=1&q=Grace");
  await expect(page).toHaveURL(/\/songs\?create=1&q=Grace$/);

  await page.goto("/song/00000000-0000-0000-0000-000000000001?edit=1#owner-edit");
  await expect(page).toHaveURL(/\/songs\/00000000-0000-0000-0000-000000000001\?edit=1#owner-edit$/);

  await page.goto("/songbook/00000000-0000-0000-0000-000000000001?from=legacy");
  await expect(page).toHaveURL(/\/songs\/00000000-0000-0000-0000-000000000001\?from=legacy$/);
});

test("the custom cross icon is served", async ({ request }) => {
  const response = await request.get("/incoc-mark.svg");
  expect(response.ok()).toBeTruthy();
  const icon = await response.text();
  expect(icon).toContain('fill="#090909"');
  expect(icon).toContain('fill="#fff"');
});

test("admin entry identifies the church and explains membership access", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("Sign-in is restricted to the website owner.")).toBeVisible();
  await expect(page.getByText(/available without signing in/i)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("public content routes do not require sign-in", async ({ page }) => {
  test.skip(!disposablePublicContentDatabase, "Use a non-production disposable Supabase test database.");
  for (const [path, heading] of [
    ["/songs", "Songbook"],
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
    "/admin/announcements",
  ];

  for (const path of protectedPaths) {
    await page.goto(path);
    const loginPage = page.getByRole("heading", { name: "Welcome back" });
    const accessState = page.getByText(/unavailable until Supabase is configured|configured Supabase project|access is not configured|after Supabase is configured/i);
    await expect.poll(async () => {
      if (await loginPage.count()) return "login";
      return (await accessState.count()) ? "configuration-notice" : "pending";
    }, { timeout: 15_000 }).not.toBe("pending");
    await expect(page.getByRole("heading", { name: "Welcome to INCOC South" })).toHaveCount(0);

    if (await loginPage.count()) {
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
