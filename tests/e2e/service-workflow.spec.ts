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

async function chooseDropdown(page: import("@playwright/test").Page, dropdown: import("@playwright/test").Locator, option: string) {
  await dropdown.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("owner controls Slides visibility while a viewer still sees the full Sunday programme", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, ownerEmail!, ownerPassword!);
  await expect(ownerPage).toHaveURL(/\/songs$/);
  await expect(ownerPage.locator(".site-header")).toHaveCount(0);
  await ownerPage.goto("/login");
  await expect(ownerPage).toHaveURL(/\/songs$/);
  await ownerPage.reload();
  await expect(ownerPage.locator(".site-header")).toHaveCount(0);

  for (const path of ["/", "/songs", "/songbook", "/schedule", "/slides"]) {
    await ownerPage.goto(path, { waitUntil: "domcontentloaded" });
    if (new URL(ownerPage.url()).pathname === "/") {
      await expect(ownerPage.locator(".site-footer-auth")).toHaveCount(0);
      await expect(ownerPage.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    } else {
      await expect(ownerPage.locator(".site-header")).toHaveCount(0);
      await expect(ownerPage.getByRole("button", { name: "Sign out" })).toBeVisible();
    }
  }
  await ownerPage.setViewportSize({ width: 360, height: 800 });
  const hasHeaderOverflow = await ownerPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHeaderOverflow).toBe(false);
  await ownerPage.setViewportSize({ width: 1280, height: 900 });
  await ownerPage.goto("/admin/songs");
  await expect(ownerPage.locator(".site-header")).toHaveCount(0);

  const secondTab = await ownerContext.newPage();
  await secondTab.goto("/admin/songs", { waitUntil: "domcontentloaded" });
  await expect(secondTab).toHaveURL(/\/admin\/songs$/);
  await expect(secondTab.locator(".site-header")).toHaveCount(0);
  await secondTab.close();

  const uniqueSuffix = Date.now();
  const songTitle = `E2E Song ${uniqueSuffix}`;
  await ownerPage.goto("/admin/songs/new");
  await ownerPage.getByLabel("Title").fill(songTitle);
  await chooseDropdown(ownerPage, ownerPage.getByLabel("Language"), "Kannada");
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
  await chooseDropdown(ownerPage, ownerPage.locator("#chorus-translation-language"), "Tamil");
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
  await expect(ownerPage.getByLabel("Language")).toHaveText("Kannada");
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

  async function addAnnouncement(content: string, displayInSlides: boolean, withImage = false) {
    await ownerPage.getByRole("button", { name: "Add Item" }).click();
    const dialog = ownerPage.getByRole("dialog", { name: "Add item" });
    await chooseDropdown(ownerPage, dialog.locator("#schedule-item-title"), "Announcements");
    await dialog.locator("#schedule-item-content").fill(content);
    if (withImage) {
      await dialog.locator(".media-picker input[type=file]").setInputFiles({
        name: "slide-preview.gif",
        mimeType: "image/gif",
        buffer: Buffer.from("R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=", "base64"),
      });
    }
    const toggle = dialog.getByRole("checkbox", { name: "Display in Slides" });
    await expect(toggle).not.toBeChecked();
    if (displayInSlides) await toggle.check();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }

  await addAnnouncement("Schedule-only notice", false);
  await addAnnouncement("Projected announcement", true, true);
  await ownerPage.reload();
  for (const [index, visible] of [[1, false], [2, true]] as const) {
    await ownerPage.getByRole("button", { name: "Edit item" }).nth(index).click();
    itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
    const toggle = itemDialog.getByRole("checkbox", { name: "Display in Slides" });
    if (visible) await expect(toggle).toBeChecked();
    else await expect(toggle).not.toBeChecked();
    await itemDialog.getByRole("button", { name: "Cancel" }).click();
  }

  await ownerPage.goto(`/slides?scheduleId=${scheduleId}`);
  let ownerSlideCards = ownerPage.locator(".slides-preview-card");
  await expect(ownerSlideCards).toHaveCount(2);
  await expect(ownerSlideCards.nth(1).locator(".slides-preview-title")).toHaveText("Announcements");
  const uploadedPreview = ownerSlideCards.nth(1).locator(".slides-preview-image");
  await expect(uploadedPreview).toHaveAttribute("src", /\.gif$/);
  await expect(uploadedPreview).toHaveJSProperty("naturalWidth", 1);
  await ownerPage.reload();
  ownerSlideCards = ownerPage.locator(".slides-preview-card");
  await expect(ownerSlideCards).toHaveCount(2);
  await expect(ownerSlideCards.nth(1).locator(".slides-preview-image")).toHaveAttribute("src", /\.gif$/);
  await ownerSlideCards.nth(1).click();
  const fullscreenImage = ownerPage.locator(".presentation-fullscreen-image");
  await expect(fullscreenImage).toBeVisible();
  await expect(ownerPage.locator(".slide-title")).toHaveCount(0);
  await expect(fullscreenImage).toHaveCSS("object-fit", "contain");
  for (const [width, height] of [[360, 800], [768, 1024], [1440, 900]]) {
    await ownerPage.setViewportSize({ width, height });
    const imageBounds = await fullscreenImage.evaluate((image) => {
      const rect = image.getBoundingClientRect();
      return { right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    expect(imageBounds.width).toBe(width);
    expect(imageBounds.height).toBe(height);
    expect(imageBounds.right).toBeLessThanOrEqual(width);
    expect(imageBounds.bottom).toBeLessThanOrEqual(height);
  }
  await ownerPage.setViewportSize({ width: 1280, height: 900 });
  await ownerPage.getByRole("button", { name: "Home: return to slide overview" }).click();

  await ownerPage.goto(`/admin/schedules/${scheduleId}`);
  await ownerPage.getByRole("button", { name: "Edit item" }).nth(2).click();
  itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
  const projectedVisibility = itemDialog.getByRole("checkbox", { name: "Display in Slides" });
  await expect(projectedVisibility).toBeChecked();
  await projectedVisibility.uncheck();
  await itemDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(itemDialog).toHaveCount(0);
  await ownerPage.goto(`/slides?scheduleId=${scheduleId}`);
  await expect(ownerPage.locator(".slides-preview-card")).toHaveCount(1);
  await ownerPage.goto(`/schedule/${scheduleId}`);
  await expect(ownerPage.getByText("Projected announcement")).toBeVisible();
  await expect(ownerPage.locator(".programme-item img")).toHaveCount(0);

  await ownerPage.goto(`/admin/schedules/${scheduleId}`);
  await ownerPage.getByRole("button", { name: "Add Item" }).click();
  itemDialog = ownerPage.getByRole("dialog", { name: "Add item" });
  await chooseDropdown(ownerPage, itemDialog.locator("#schedule-item-title"), "Other / Custom title");
  await itemDialog.getByLabel("Custom title").fill("Special service segment");
  await itemDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(itemDialog).toHaveCount(0);
  await expect(ownerPage.getByText("Special service segment", { exact: true })).toBeVisible();
  await ownerPage.getByRole("button", { name: "Edit item" }).last().click();
  itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
  await expect(itemDialog.locator("#schedule-item-title")).toHaveText("Other / Custom title");
  await expect(itemDialog.getByLabel("Custom title")).toHaveValue("Special service segment");
  await itemDialog.getByRole("button", { name: "Cancel" }).click();

  await ownerPage.goto(`/admin/schedules/${scheduleId}`);
  await ownerPage.getByRole("button", { name: "Edit item" }).nth(2).click();
  itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
  await itemDialog.getByRole("checkbox", { name: "Display in Slides" }).check();
  await itemDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(itemDialog).toHaveCount(0);
  await ownerPage.reload();
  await ownerPage.getByRole("button", { name: "Edit item" }).nth(2).click();
  itemDialog = ownerPage.getByRole("dialog", { name: "Edit item" });
  await expect(itemDialog.getByRole("checkbox", { name: "Display in Slides" })).toBeChecked();
  await itemDialog.getByRole("button", { name: "Cancel" }).click();

  await ownerPage.goto("/songs");
  await ownerPage.getByRole("button", { name: "Sign out" }).click();
  await expect(ownerPage.getByRole("link", { name: "Sign in" })).toBeVisible();
  await ownerPage.goto("/admin");
  await expect(ownerPage).toHaveURL(/\/login$/);
  await expect(ownerPage.getByRole("heading", { name: "Welcome to INCOC South" })).toHaveCount(0);

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await viewerPage.emulateMedia({ colorScheme: "dark" });
  await signIn(viewerPage, viewerEmail!, viewerPassword!);
  await expect(viewerPage).toHaveURL(/\/songs$/);
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
  await expect(slideCards.first()).toHaveCSS("background-color", await slideCards.first().evaluate((element) => getComputedStyle(element).backgroundColor));
  await expect(slideCards.first()).toHaveCSS("border-top-width", "1px");
  await expect(slideCards.first()).toHaveCSS("border-radius", "9px");
  await expect(slideCards.first().locator(".slides-preview-title")).toHaveCSS("text-align", "center");
  await expect(slideCards.nth(0).locator(".slides-preview-title")).toHaveText("Communion Song");
  await expect(slideCards.nth(0).locator(".slides-preview-subtitle")).toHaveText(songTitle);
  await expect(slideCards.nth(0).locator(".slides-preview-content, .slides-preview-image, small")).toHaveCount(0);
  await expect(slideCards.nth(1).locator(".slides-preview-title")).toHaveText("Announcements");
  const projectedImage = slideCards.nth(1).locator(".slides-preview-image");
  await expect(projectedImage).toHaveAttribute("src", /\.gif$/);
  for (const width of [360, 768, 1440]) {
    await viewerPage.setViewportSize({ width, height: 900 });
    await expect(slideCards.nth(1)).toBeVisible();
    const layout = await slideCards.nth(1).evaluate((card) => {
      const image = card.querySelector("img");
      if (!image) return null;
      const cardRect = card.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      return {
        insideCard: imageRect.left >= cardRect.left && imageRect.right <= cardRect.right,
        objectFit: getComputedStyle(image).objectFit,
      };
    });
    expect(layout?.insideCard).toBe(true);
    expect(layout?.objectFit).toBe("contain");
  }
  await viewerPage.setViewportSize({ width: 1280, height: 900 });
  await expect(slideCards.locator("small")).toHaveCount(0);
  await viewerPage.getByRole("link", { name: new RegExp(songTitle) }).click();

  const presentationCounter = viewerPage.locator(".presentation-slide-counter");
  await expect(viewerPage.locator(".presentation-toolbar")).toHaveCount(0);
  await expect(viewerPage.getByRole("button", { name: "Previous item" })).toBeDisabled();
  await expect(presentationCounter).toContainText(/^1 \/ \d+$/);
  await expect(viewerPage.locator(".slide-stage")).toHaveCSS("background-color", "rgb(11, 11, 10)");
  const zoomShortcutsPrevented = await viewerPage.evaluate(() => ["+", "-", "0"].map((key) => {
    const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }));
  expect(zoomShortcutsPrevented).toEqual([false, false, false]);
  await expect(viewerPage.locator(".slide-section")).toHaveCount(0);
  await expect(viewerPage.getByLabel("Lyrics size")).toHaveCount(0);
  const songTitleSize = await viewerPage.locator(".slide-title").evaluate((element) => getComputedStyle(element).fontSize);
  const counterSize = await presentationCounter.evaluate((element) => getComputedStyle(element).fontSize);
  const presentationControls = viewerPage.locator(".presentation-bottom-controls");
  await expect(viewerPage.getByRole("button", { name: "Next item" })).toHaveCSS("width", "30px");
  await expect(presentationControls).toHaveCSS("opacity", "0");
  await expect(viewerPage.locator(".slide-title")).toHaveCSS("font-size", songTitleSize);
  await expect(presentationCounter).toHaveCSS("font-size", counterSize);
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

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(`/present/${scheduleId}?slide=0`);
  const touchControls = touchPage.locator(".presentation-bottom-controls");
  await expect(touchControls).toHaveCSS("opacity", "0.8");
  const touchCounter = touchPage.locator(".presentation-slide-counter");
  const touchStage = touchPage.locator(".slide-stage");
  async function swipe(startX: number, startY: number, endX: number, endY: number) {
    await touchStage.evaluate((stage, coordinates) => {
      const dispatch = (type: "touchstart" | "touchend", x: number, y: number) => {
        const touch = new Touch({ identifier: 1, target: stage, clientX: x, clientY: y });
        stage.dispatchEvent(new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === "touchstart" ? [touch] : [],
          changedTouches: [touch],
        }));
      };
      dispatch("touchstart", coordinates.startX, coordinates.startY);
      dispatch("touchend", coordinates.endX, coordinates.endY);
    }, { startX, startY, endX, endY });
  }
  await swipe(300, 300, 220, 302);
  await expect(touchCounter).toContainText(/^2 \/ \d+$/);
  await expect(touchPage.locator(".slide-title")).toHaveText(songTitle);
  await swipe(220, 300, 300, 302);
  await expect(touchCounter).toContainText(/^1 \/ \d+$/);
  await swipe(300, 300, 304, 220);
  await expect(touchCounter).toContainText(/^1 \/ \d+$/);
  const nextSlideHref = await slideCards.nth(1).getAttribute("href");
  const nextItemSlide = Number(new URL(nextSlideHref!, viewerPage.url()).searchParams.get("slide"));
  await touchPage.goto(`/present/${scheduleId}?slide=${nextItemSlide - 1}`);
  const lastSongSlide = await touchCounter.innerText();
  await swipe(300, 300, 220, 302);
  await expect(touchCounter).toHaveText(lastSongSlide);
  await expect(touchPage.locator(".slide-title")).toHaveText(songTitle);
  await touchPage.getByRole("button", { name: "Next item" }).tap();
  await expect(touchPage.locator(".slide-title")).toHaveText("Announcements");
  await touchContext.close();

  await viewerContext.close();
  await ownerContext.close();
});
