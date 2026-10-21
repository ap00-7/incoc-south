import { expect, test } from "@playwright/test";

const ownerEmail = process.env.E2E_OWNER_EMAIL;
const ownerPassword = process.env.E2E_OWNER_PASSWORD;
const viewerEmail = process.env.E2E_VIEWER_EMAIL;
const viewerPassword = process.env.E2E_VIEWER_PASSWORD;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const isDisposableTestDatabase = process.env.E2E_TEST_DATABASE === "disposable"
  && Boolean(supabaseUrl)
  && !supabaseUrl?.includes("ckgnhsnqeabowkctvdqj");

test.skip(
  !isDisposableTestDatabase || !ownerEmail || !ownerPassword || !viewerEmail || !viewerPassword,
  "Set E2E_TEST_DATABASE=disposable and test-account credentials for a non-production Supabase project.",
);

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("owner controls Slides visibility while a viewer still sees the full Sunday programme", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, ownerEmail!, ownerPassword!);
  await expect(ownerPage).toHaveURL(/\/song$/);
  await expect(ownerPage.getByRole("link", { name: "Owner" })).toBeVisible();
  await ownerPage.goto("/login");
  await expect(ownerPage).toHaveURL(/\/song$/);
  await ownerPage.reload();
  await expect(ownerPage.getByRole("link", { name: "Owner" })).toBeVisible();

  for (const path of ["/", "/songbook", "/schedule", "/slides"]) {
    await ownerPage.goto(path, { waitUntil: "domcontentloaded" });
    await expect(ownerPage.getByRole("button", { name: "Sign out" })).toBeVisible();
  }
  await ownerPage.setViewportSize({ width: 360, height: 800 });
  const hasHeaderOverflow = await ownerPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHeaderOverflow).toBe(false);
  await ownerPage.setViewportSize({ width: 1280, height: 900 });
  await ownerPage.goto("/admin/songs");
  await expect(ownerPage.getByRole("link", { name: "Owner" })).toBeVisible();

  const secondTab = await ownerContext.newPage();
  await secondTab.goto("/admin/songs", { waitUntil: "domcontentloaded" });
  await expect(secondTab).toHaveURL(/\/admin\/songs$/);
  await expect(secondTab.getByRole("link", { name: "Owner" })).toBeVisible();
  await secondTab.close();

  const uniqueSuffix = Date.now();
  const songTitle = `E2E Song ${uniqueSuffix}`;
  await ownerPage.goto("/admin/songs/new");
  await ownerPage.getByLabel("Title").fill(songTitle);
  await ownerPage.getByLabel("Language").selectOption("Kannada");
  await ownerPage.getByLabel("Has Translation").check();
  await ownerPage.getByLabel("Start With Chorus").check();

  const firstVerse = ownerPage.getByRole("button", { name: /Verse 1 No lyrics added/ });
  await firstVerse.click();
  const firstVerseDialog = ownerPage.getByRole("dialog", { name: "Edit Verse" });
  await firstVerseDialog.getByLabel("Lyrics").fill("First verse lyrics");
  await firstVerseDialog.getByLabel("Translation").fill("First verse translation");
  await firstVerseDialog.getByRole("button", { name: "Apply" }).click();

  await ownerPage.getByRole("button", { name: "Add item" }).click();
  const secondVerseDialog = ownerPage.getByRole("dialog", { name: "Edit Verse" });
  await secondVerseDialog.getByLabel("Lyrics").fill("Second verse lyrics");
  await secondVerseDialog.getByLabel("Translation").fill("Second verse translation");
  await secondVerseDialog.getByRole("button", { name: "Apply" }).click();
  await ownerPage.getByRole("button", { name: "Move verse 2 up" }).click();

  await ownerPage.locator(".song-part").nth(0).locator("summary").click();
  await ownerPage.locator(".song-part").nth(1).locator("summary").click();
  await ownerPage.locator(".song-part").nth(2).locator("summary").click();
  await ownerPage.locator("#pre_chorus-lyrics").fill("Pre-chorus lyrics");
  await ownerPage.locator("#chorus-lyrics").fill("Chorus lyrics");
  await ownerPage.locator("#chorus-translation").fill("Chorus translation");
  await ownerPage.locator("#chorus-translation-language").selectOption("Tamil");
  await ownerPage.locator("#bridge-lyrics").fill("Bridge lyrics");

  await ownerPage.getByRole("button", { name: "Add item" }).click();
  const hiddenVerseDialog = ownerPage.getByRole("dialog", { name: "Edit Verse" });
  await hiddenVerseDialog.getByLabel("Lyrics").fill("Hidden verse lyrics");
  await hiddenVerseDialog.getByLabel("Hide").check();
  await hiddenVerseDialog.getByRole("button", { name: "Apply" }).click();

  await ownerPage.getByRole("button", { name: "Create song" }).click();
  await expect(ownerPage.getByRole("heading", { name: songTitle })).toBeVisible();
  const songId = ownerPage.url().match(/\/admin\/songs\/([0-9a-f-]{36})$/i)?.[1];
  expect(songId).toBeTruthy();
  await expect(ownerPage.getByLabel("Language")).toHaveValue("Kannada");
  await expect(ownerPage.getByLabel("Has Translation")).toBeChecked();
  await expect(ownerPage.getByLabel("Start With Chorus")).toBeChecked();
  await ownerPage.goto(`/songbook/${songId}`);
  await expect(ownerPage.locator(".lyrics-section h2")).toHaveText([
    "Chorus",
    "Verse 1",
    "Pre-Chorus",
    "Chorus",
    "Verse 2",
    "Pre-Chorus",
    "Chorus",
    "Bridge",
    "Pre-Chorus",
    "Chorus",
  ]);
  await expect(ownerPage.locator(".lyrics-section .lyrics-text")).toHaveText([
    "Chorus lyrics",
    "Second verse lyrics",
    "Pre-chorus lyrics",
    "Chorus lyrics",
    "First verse lyrics",
    "Pre-chorus lyrics",
    "Chorus lyrics",
    "Bridge lyrics",
    "Pre-chorus lyrics",
    "Chorus lyrics",
  ]);
  await expect(ownerPage.locator(".lyrics-section .lyrics-text")).not.toContainText("Hidden verse lyrics");
  await expect(ownerPage.locator(".song-translation-section .lyrics-text")).toHaveText([
    "Chorus translation",
    "Second verse translation",
    "Chorus translation",
    "First verse translation",
    "Chorus translation",
    "Chorus translation",
  ]);

  const sunday = new Date();
  sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7 || 7));
  const serviceDate = sunday.toISOString().slice(0, 10);
  const scheduleTitle = `E2E Sunday Service ${uniqueSuffix}`;
  await ownerPage.goto("/admin/schedules/new");
  await ownerPage.getByLabel("Title").fill(scheduleTitle);
  await ownerPage.getByLabel("Date").fill(serviceDate);
  await ownerPage.getByRole("button", { name: "Create schedule" }).click();
  await expect(ownerPage.getByRole("heading", { name: scheduleTitle })).toBeVisible();
  const scheduleId = ownerPage.url().match(/\/admin\/schedules\/([0-9a-f-]{36})$/i)?.[1];
  expect(scheduleId).toBeTruthy();

  await ownerPage.getByRole("button", { name: "Add Song" }).click();
  let itemDialog = ownerPage.getByRole("dialog", { name: "Add item" });
  await itemDialog.getByRole("button", { name: "Select a Songbook song" }).click();
  await itemDialog.getByPlaceholder("Search songs").fill(songTitle);
  await itemDialog.getByRole("button", { name: new RegExp(songTitle) }).click();
  let songSlidesToggle = itemDialog.getByRole("checkbox", { name: "Display in Slides" });
  await expect(songSlidesToggle).not.toBeChecked();
  await songSlidesToggle.check();
  await itemDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(itemDialog).toHaveCount(0);

  await ownerPage.reload();
  await ownerPage.getByRole("button", { name: "Edit item" }).first().click();
  itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
  songSlidesToggle = itemDialog.getByRole("checkbox", { name: "Display in Slides" });
  await expect(songSlidesToggle).toBeChecked();
  await songSlidesToggle.uncheck();
  await itemDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(itemDialog).toHaveCount(0);

  await ownerPage.reload();
  await ownerPage.getByRole("button", { name: "Edit item" }).first().click();
  itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
  songSlidesToggle = itemDialog.getByRole("checkbox", { name: "Display in Slides" });
  await expect(songSlidesToggle).not.toBeChecked();
  await songSlidesToggle.check();
  await itemDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(itemDialog).toHaveCount(0);

  await ownerPage.reload();
  await ownerPage.getByRole("button", { name: "Edit item" }).first().click();
  itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
  await expect(itemDialog.getByRole("checkbox", { name: "Display in Slides" })).toBeChecked();
  await itemDialog.getByRole("button", { name: "Cancel" }).click();

  async function addAnnouncement(content: string, displayInSlides: boolean) {
    await ownerPage.getByRole("button", { name: "Add Item" }).click();
    const dialog = ownerPage.getByRole("dialog", { name: "Add item" });
    await dialog.locator("#schedule-item-title").selectOption("Announcements");
    await dialog.locator("#schedule-item-content").fill(content);
    const toggle = dialog.getByRole("checkbox", { name: "Display in Slides" });
    await expect(toggle).not.toBeChecked();
    if (displayInSlides) await toggle.check();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }

  await addAnnouncement("Schedule-only notice", false);
  await addAnnouncement("Projected announcement", true);
  await ownerPage.reload();
  for (const [index, visible] of [[1, false], [2, true]] as const) {
    await ownerPage.getByRole("button", { name: "Edit item" }).nth(index).click();
    itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
    const toggle = itemDialog.getByRole("checkbox", { name: "Display in Slides" });
    if (visible) await expect(toggle).toBeChecked();
    else await expect(toggle).not.toBeChecked();
    await itemDialog.getByRole("button", { name: "Cancel" }).click();
  }

  await ownerPage.getByRole("button", { name: "Sign out" }).click();
  await expect(ownerPage).toHaveURL(/\/login$/);
  await expect(ownerPage.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await ownerPage.goto("/admin");
  await expect(ownerPage).toHaveURL(/\/login$/);
  await expect(ownerPage.getByRole("heading", { name: "Welcome to INCOC South" })).toHaveCount(0);

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await signIn(viewerPage, viewerEmail!, viewerPassword!);
  await expect(viewerPage).toHaveURL(/\/songbook$/);
  await viewerPage.goto("/admin");
  await expect(viewerPage).toHaveURL(/\/access-denied$/);
  await viewerPage.goto("/schedule");
  await viewerPage.getByRole("link", { name: new RegExp(scheduleTitle) }).click();
  await expect(viewerPage.getByRole("heading", { name: scheduleTitle })).toBeVisible();
  await expect(viewerPage.getByRole("heading", { name: songTitle })).toBeVisible();
  await expect(viewerPage.getByText("Schedule-only notice")).toBeVisible();
  await expect(viewerPage.getByText("Projected announcement")).toBeVisible();
  await viewerPage.goto(`/slides?scheduleId=${scheduleId}`);
  const slideCards = viewerPage.locator(".slides-preview-card");
  await expect(slideCards).toHaveCount(2);
  await expect(viewerPage.getByText("Schedule-only notice")).toHaveCount(0);
  await expect(viewerPage.getByText("Projected announcement")).toBeVisible();
  await expect(slideCards.first()).toHaveCSS("background-color", "rgb(8, 8, 8)");
  await expect(slideCards.first()).toHaveCSS("border-top-width", "1px");
  await expect(slideCards.first()).toHaveCSS("border-radius", "9px");
  await expect(slideCards.first().locator(".slides-preview-title")).toHaveCSS("text-align", "center");
  await expect(slideCards.nth(0).locator(".slides-preview-title")).toHaveText("Communion Song");
  await expect(slideCards.nth(0).locator(".slides-preview-subtitle")).toHaveText(songTitle);
  await expect(slideCards.nth(0).locator(".slides-preview-content, .slides-preview-image, small")).toHaveCount(0);
  await expect(slideCards.nth(1).locator(".slides-preview-title")).toHaveText("Announcements");
  await expect(slideCards.nth(1).locator(".slides-preview-content")).toHaveText("Projected announcement");
  await expect(slideCards.locator("small")).toHaveCount(0);
  await viewerPage.getByRole("link", { name: new RegExp(songTitle) }).click();

  const presentationCounter = viewerPage.locator(".presentation-slide-counter");
  await expect(viewerPage.locator(".presentation-toolbar")).toHaveCount(0);
  await expect(viewerPage.getByRole("button", { name: "Previous item" })).toBeDisabled();
  await expect(presentationCounter).toContainText(/^1 \/ \d+$/);
  await expect(viewerPage.locator(".slide-stage")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(viewerPage.locator(".slide-section")).toHaveCount(0);
  const lyricsSize = viewerPage.getByLabel("Lyrics size");
  const songTitleSize = await viewerPage.locator(".slide-title").evaluate((element) => getComputedStyle(element).fontSize);
  const counterSize = await presentationCounter.evaluate((element) => getComputedStyle(element).fontSize);
  const previousButtonWidth = await viewerPage.getByRole("button", { name: "Previous item" }).evaluate((element) => getComputedStyle(element).width);
  const firstLyricsSize = await viewerPage.locator(".slide-lyrics").evaluate((element) => getComputedStyle(element).fontSize);
  await lyricsSize.focus();
  await viewerPage.keyboard.press("ArrowRight");
  await expect(lyricsSize).toHaveValue("105");
  await expect(viewerPage.locator(".slide-title")).toHaveCSS("font-size", songTitleSize);
  await expect(presentationCounter).toHaveCSS("font-size", counterSize);
  await expect(viewerPage.getByRole("button", { name: "Previous item" })).toHaveCSS("width", previousButtonWidth);
  await expect.poll(() => viewerPage.locator(".slide-lyrics").evaluate((element) => getComputedStyle(element).fontSize)).not.toBe(firstLyricsSize);
  const presentationControls = viewerPage.locator(".presentation-bottom-controls");
  await expect(viewerPage.getByRole("button", { name: "Next item" })).toHaveCSS("width", "40px");
  await expect(presentationControls).toHaveCSS("opacity", "0.16");
  await presentationControls.hover();
  await expect(presentationControls).toHaveCSS("opacity", "1");
  await viewerPage.getByRole("button", { name: "Next item" }).click();
  await expect(viewerPage.locator(".slide-title")).toHaveText("Announcements");
  await viewerPage.getByRole("button", { name: "Previous item" }).click();
  await expect(viewerPage.locator(".slide-title")).toHaveText(songTitle);
  await expect(presentationCounter).toContainText(/^1 \/ \d+$/);
  await viewerPage.locator(".slide-title").click();
  await viewerPage.keyboard.press("ArrowRight");
  await expect(viewerPage.locator(".slide-title")).toHaveText("Announcements");
  await viewerPage.keyboard.press("ArrowLeft");
  await expect(viewerPage.locator(".slide-title")).toHaveText(songTitle);
  await viewerPage.getByRole("button", { name: "Home: return to slide overview" }).click();
  await expect(viewerPage).toHaveURL(new RegExp(`/slides\\?scheduleId=${scheduleId}`));

  await viewerContext.close();
  await ownerContext.close();
});
