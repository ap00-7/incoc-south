import { expect, test } from "@playwright/test";

const ownerEmail = process.env.E2E_OWNER_EMAIL;
const ownerPassword = process.env.E2E_OWNER_PASSWORD;
const viewerEmail = process.env.E2E_VIEWER_EMAIL;
const viewerPassword = process.env.E2E_VIEWER_PASSWORD;

test.skip(
  !ownerEmail || !ownerPassword || !viewerEmail || !viewerPassword,
  "Set E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_VIEWER_EMAIL, and E2E_VIEWER_PASSWORD for the Supabase workflow test.",
);

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("owner publishes a Sunday programme that a viewer can present", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, ownerEmail!, ownerPassword!);
  await expect(ownerPage).toHaveURL(/\/admin$/);

  const uniqueSuffix = Date.now();
  const songTitle = `E2E Song ${uniqueSuffix}`;
  await ownerPage.goto("/admin/songs/new");
  await ownerPage.getByLabel("Song title").fill(songTitle);
  await ownerPage.getByLabel("Language").fill("English");
  await ownerPage.getByLabel("Section label").fill("Verse 1");
  await ownerPage.getByLabel("Lyrics").fill([
    "First verse line one",
    "First verse line two",
    "First verse line three",
    "First verse line four",
    "First verse line five",
    "First verse line six",
    "First verse line seven",
  ].join("\n"));
  await ownerPage.getByRole("button", { name: "Save song" }).click();
  await expect(ownerPage.getByRole("heading", { name: songTitle })).toBeVisible();

  const addSectionForm = ownerPage.locator("form").filter({
    has: ownerPage.locator('textarea[name="lyrics"]'),
  }).last();
  await addSectionForm.getByLabel("Section type").selectOption("chorus");
  await addSectionForm.getByLabel("Custom label").fill("Chorus");
  await addSectionForm.locator('textarea[name="lyrics"]').fill("Sing together\nIn hope");
  await addSectionForm.getByRole("button", { name: "Add section" }).click();
  await expect(ownerPage.getByRole("heading", { name: "Chorus" })).toBeVisible();

  const sunday = new Date();
  sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7 || 7));
  const serviceDate = sunday.toISOString().slice(0, 10);
  const scheduleTitle = `E2E Sunday Service ${uniqueSuffix}`;
  await ownerPage.goto("/admin/schedules/new");
  await ownerPage.getByLabel("Service title").fill(scheduleTitle);
  await ownerPage.getByLabel("Date").fill(serviceDate);
  await ownerPage.getByRole("button", { name: "Create draft" }).click();
  await expect(ownerPage.getByRole("heading", { name: scheduleTitle })).toBeVisible();
  const scheduleId = ownerPage.url().match(/\/admin\/schedules\/([0-9a-f-]{36})$/i)?.[1];
  expect(scheduleId).toBeTruthy();

  const addItemForm = ownerPage.locator("form").last();
  await addItemForm.getByLabel("Type").selectOption("song");
  await addItemForm.getByLabel(/choose for a song item/).selectOption({ label: `${songTitle} · English` });
  await addItemForm.getByRole("button", { name: "Add programme item" }).click();
  await expect(ownerPage.getByRole("heading", { name: songTitle })).toBeVisible();

  const addPrayerForm = ownerPage.locator("form").last();
  await addPrayerForm.getByLabel("Type").selectOption("prayer");
  await addPrayerForm.getByLabel(/Programme title/).fill("Responsive reading");
  await addPrayerForm.getByLabel(/Display or public content/).fill("Read the selected passage together.");
  await addPrayerForm.getByRole("button", { name: "Add programme item" }).click();
  await expect(ownerPage.getByRole("heading", { name: "Responsive reading" })).toBeVisible();

  ownerPage.once("dialog", (dialog) => dialog.accept());
  await ownerPage.getByRole("button", { name: "Publish service" }).click();
  await expect(ownerPage.getByRole("button", { name: "Unpublish" })).toBeVisible();

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await signIn(viewerPage, viewerEmail!, viewerPassword!);
  await expect(viewerPage).toHaveURL(/\/songbook$/);
  await viewerPage.goto("/schedule");
  await viewerPage.getByRole("link", { name: new RegExp(scheduleTitle) }).click();
  await expect(viewerPage.getByRole("heading", { name: scheduleTitle })).toBeVisible();
  await expect(viewerPage.getByRole("heading", { name: songTitle })).toBeVisible();
  await expect(viewerPage.getByRole("heading", { name: "Responsive reading" })).toBeVisible();
  await viewerPage.getByRole("link", { name: "Open slides" }).click();
  await viewerPage.getByRole("link", { name: "Present service" }).click();

  const presentationControls = viewerPage.locator(".presentation-controls");
  await expect(presentationControls).toContainText("Slide 1 /");
  await viewerPage.keyboard.press("ArrowRight");
  await expect(presentationControls).toContainText("Slide 2 /");

  await viewerContext.close();
  await ownerContext.close();
});
