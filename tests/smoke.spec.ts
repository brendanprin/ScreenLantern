import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const DEMO_EMAIL = "brendan@screenlantern.demo";
const MEMBER_EMAIL = "katie@screenlantern.demo";
const GEOFF_EMAIL = "geoff@screenlantern.demo";
const DEMO_PASSWORD = "screenlantern-demo";
const SEEDED_INVITE_CODE = "LANTERNJOIN";
const ARRIVAL_TITLE = {
  tmdbId: 12,
  mediaType: "movie",
  title: "Arrival",
  overview:
    "A linguist leads the effort to communicate with mysterious visitors whose arrival changes the world.",
  posterPath: null,
  backdropPath: null,
  releaseDate: "2016-11-11",
  runtimeMinutes: 116,
  genres: ["Science Fiction", "Drama", "Mystery"],
  voteAverage: 7.7,
  popularity: 77,
  providers: [{ name: "Prime Video" }, { name: "Paramount Plus" }],
};

const DUNE_TITLE = {
  tmdbId: 11,
  mediaType: "movie",
  title: "Dune",
  overview:
    "A gifted young heir must survive a deadly struggle over the galaxy's most valuable resource.",
  posterPath: null,
  backdropPath: null,
  releaseDate: "2021-10-22",
  runtimeMinutes: 155,
  genres: ["Science Fiction", "Adventure", "Drama"],
  voteAverage: 8,
  popularity: 91,
  providers: [{ name: "Max" }, { name: "Netflix" }],
};

async function signInAs(page: Page, email = DEMO_EMAIL) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

async function ensureActiveButton(button: ReturnType<Page["getByRole"]>) {
  const classes = (await button.getAttribute("class")) ?? "";

  if (!classes.includes("bg-primary")) {
    await button.click();
  }

  await expect(button).toHaveClass(/bg-primary/);
}

async function useSavedGroup(page: Page, groupName: string) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page
      .getByRole("button", {
        name: `Use group ${groupName}`,
        exact: true,
      })
      .click(),
  ]);
}

async function useSoloProfile(page: Page) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use my solo profile" }).click(),
  ]);
}

async function askAssistant(page: Page, message: string) {
  await page.getByLabel("Ask for a recommendation").fill(message);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/assistant") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Ask ScreenLantern" }).click(),
  ]);
}

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

test("redirects anonymous users away from protected routes", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.goto("/app", { waitUntil: "commit" }).catch(() => null);
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/app/assistant", { waitUntil: "commit" }).catch(() => null);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("register and create household works", async ({ page }) => {
  const email = uniqueEmail("create");
  await page.goto("/sign-up");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Taylor");
  await page
    .getByRole("textbox", { name: "Household name", exact: true })
    .fill("Aurora House");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("screenlantern-demo");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/household");
  await expect(page.getByRole("heading", { name: "Aurora House" })).toBeVisible();
  await expect(page.getByText(/You are in this household as OWNER/i)).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});

test("register and join household via valid invite works", async ({ page }) => {
  const email = uniqueEmail("join");
  await page.goto(`/sign-up?invite=${SEEDED_INVITE_CODE}`);
  await expect(page.getByText("Active invite")).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Morgan");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("screenlantern-demo");
  await page.getByRole("button", { name: "Join household" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/household");
  await expect(page.getByRole("heading", { name: "Lantern House" })).toBeVisible();
  await expect(page.getByText(/You are in this household as MEMBER/i)).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
});

test("invalid invite rejection fails gracefully", async ({ page }) => {
  await page.goto("/sign-up?invite=NOTREAL");
  await expect(page.getByText(/invalid or expired/i)).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Jordan");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(uniqueEmail("invalid"));
  await page.getByLabel("Password", { exact: true }).fill("screenlantern-demo");
  await page.getByRole("button", { name: "Join household" }).click();
  await expect(page.getByText(/invite code is invalid/i)).toBeVisible();
});

test("search and detail flow works", async ({ page }) => {
  await signInAs(page);
  await page.goto("/app/search?query=Dune&mediaType=all");
  await expect(page.getByText('1 result for "Dune"')).toBeVisible();
  await page.getByRole("link", { name: "Dune" }).first().click();
  await expect(page.getByRole("heading", { name: "Dune" })).toBeVisible();
  await expect(page.getByText("Where to watch")).toBeVisible();
  await expect(page.getByRole("link", { name: "Search in Max" })).toBeVisible();
  await expect(page.getByText("Choose service")).toBeVisible();
});

test("streaming handoff stays honest on detail and library surfaces", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/title/tv/101");
  await expect(
    page.getByText("Available on Disney Plus, but direct open is unavailable."),
  ).toBeVisible();
  await expect(page.getByText("Availability only")).toBeVisible();

  await page.goto("/app/library?collection=LIKE");
  const duneCard = page.getByTestId("library-card-collection-movie-11");
  await expect(duneCard).toBeVisible();
  await expect(duneCard.getByRole("link", { name: "Search in Max" })).toBeVisible();
});

test("watchlist and taste actions work on a title detail page", async ({ page }) => {
  await signInAs(page);
  await page.goto("/app/title/movie/12");
  const watchlistButton = page.getByRole("button", {
    name: "Save for me",
    exact: true,
  });
  const likeButton = page.getByRole("button", { name: "Like", exact: true });

  await ensureActiveButton(watchlistButton);
  await ensureActiveButton(likeButton);

  await page.goto("/app/library?tab=WATCHLIST");
  await expect(page.getByTestId("library-section-collection")).toContainText("Arrival");
  await page.goto("/app/library?tab=LIKE");
  await expect(page.getByTestId("library-section-collection")).toContainText("Arrival");
});

test("group recommendation happy path is visible from household mode", async ({
  page,
}) => {
  await signInAs(page, GEOFF_EMAIL);
  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Recommendations for Brendan + Palmer" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Recommendations for Brendan + Palmer" }),
  ).toBeVisible();
});

test("assistant supports solo recommendation refinement and why-this follow-up", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/household");
  await useSoloProfile(page);
  await page.goto("/app/assistant");
  await expect(
    page.getByRole("heading", {
      name: "Ask ScreenLantern for grounded picks instead of starting from a blank slate.",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("assistant-context-label")).toHaveText("For Brendan");

  await askAssistant(page, "Give me something funny under 2 hours.");
  const latestAnswer = page.getByTestId("assistant-message-assistant").last();
  await expect(latestAnswer).toBeVisible();
  await expect(latestAnswer.getByTestId("assistant-card")).toHaveCount(3);

  await askAssistant(page, "Why this?");
  const whyAnswer = page.getByTestId("assistant-message-assistant").last();
  await expect(whyAnswer).toContainText(/Brendan|fit/i);

  await askAssistant(page, "Give me 3 options instead.");
  const refinedAnswer = page.getByTestId("assistant-message-assistant").last();
  await expect(refinedAnswer.getByTestId("assistant-card")).toHaveCount(3);
});

test("assistant respects group context, shared watchlist state, and provider-aware handoff", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");

  await page.goto("/app/title/movie/11");
  await page.getByRole("button", { name: "Save for current group" }).click();

  await page.goto("/app/assistant");
  await expect(page.getByTestId("assistant-context-label")).toHaveText(
    "For Brendan + Palmer",
  );

  await askAssistant(page, "What should Brendan + Palmer watch tonight on our services?");
  const groupAnswer = page.getByTestId("assistant-message-assistant").last();
  await expect(groupAnswer).toContainText("Brendan + Palmer");

  await askAssistant(page, "What about something we saved already?");
  const sharedWatchlistAnswer = page.getByTestId("assistant-message-assistant").last();
  await expect(sharedWatchlistAnswer).toContainText(/Saved by|Saved for/);
  await expect(sharedWatchlistAnswer.getByTestId("assistant-card").first()).toBeVisible();
  await expect(
    sharedWatchlistAnswer
      .getByRole("link", { name: /Search in Max|Search in Netflix/ })
      .first(),
  ).toBeVisible();
});

test("recommendation explanations surface for solo and group contexts", async ({
  page,
}) => {
  await signInAs(page, MEMBER_EMAIL);
  await expect(
    page.locator("p.text-sm.font-medium.text-primary").first(),
  ).toContainText(
    /Because you usually land on|Available on your selected services|Good fit for your usual|Saved to your watchlist and available on your services|Back on your radar from your watchlist/,
  );

  await page.getByText("Why this for Katie?").first().click();
  await expect(
    page.locator("details[open]").getByText(
      /Those genres show up most often in your positive taste signals|It is available on|Your recent taste signals lean toward this kind of pick right now|It is currently practical to start from the services tied to this profile|You already saved it, and it still lines up with the shape of your current picks/,
    ).first(),
  ).toBeVisible();

  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Recommendations for Brendan + Palmer" }),
  ).toBeVisible();

  await page.getByText("Why this for Brendan + Palmer?").first().click();
  await expect(
    page.locator("details[open]").getByText(
      /This leans into genres that more than one selected member tends to enjoy|It is available on .*which helps keep it practical for Brendan and Palmer|That makes it a fresher option for this room|already saved this, so it is worth bringing back into the room conversation|It is already in this group's orbit, so ScreenLantern is bringing it back into view/,
    ).first(),
  ).toBeVisible();
});

test("title detail surfaces solo fit, mixed group fit, and watched-together truth", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/household");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use my solo profile" }).click(),
  ]);

  await page.goto("/app/title/movie/11");
  const soloFitSummary = page.getByTestId("title-fit-summary");
  await expect(soloFitSummary).toContainText("Best fit for Brendan");
  await expect(soloFitSummary).toContainText("Best for Brendan");
  await expect(page.getByTestId("title-fit-member-brendan")).toContainText(
    "Already likes it",
  );
  await expect(page.getByTestId("title-fit-member-geoff")).toContainText(
    "Potential conflict",
  );
  await expect(page.getByTestId("title-fit-member-geoff")).toContainText("Disliked it");

  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer + Geoff");

  await page.goto("/app/title/tv/106");
  const groupFitSummary = page.getByTestId("title-fit-summary");
  await expect(groupFitSummary).toContainText("Mixed fit for Brendan + Palmer + Geoff");
  await expect(page.getByTestId("title-fit-member-brendan")).toContainText(
    "Potential conflict",
  );

  await page.getByRole("button", { name: "Save for household" }).click();
  await expect(groupFitSummary).toContainText("Saved by Brendan for the household.");

  await page.getByRole("button", { name: "Watched by current group" }).click();
  await expect(groupFitSummary).toContainText(
    "Brendan + Palmer + Geoff already watched this together",
  );
});

test("watchlist resurfacing lanes highlight available-now picks and suppress watched group titles", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/household");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use my solo profile" }).click(),
  ]);
  await page.goto("/app");
  const soloAvailableLane = page.getByTestId("recommendation-lane-available_now");
  await expect(soloAvailableLane).toBeVisible();
  await expect(
    soloAvailableLane.getByRole("heading", { name: "Mad Max: Fury Road" }),
  ).toBeVisible();
  await expect(
    soloAvailableLane.getByText("Available now", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    soloAvailableLane.locator("p.text-sm.font-medium.text-primary").first(),
  ).toContainText("Saved to your watchlist and available on your services");

  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");
  await page.goto("/app");
  const groupAvailableLane = page.getByTestId("recommendation-lane-available_now");
  await expect(groupAvailableLane).toBeVisible();
  await expect(
    groupAvailableLane.getByRole("heading", {
      name: "Spider-Man: Into the Spider-Verse",
    }),
  ).toBeVisible();

  await page.goto("/app/title/movie/18");
  await page.getByRole("button", { name: "Watched by current group" }).click();
  await page.goto("/app");
  await expect(
    page
      .getByTestId("recommendation-lane-available_now")
      .getByRole("heading", {
        name: "Spider-Man: Into the Spider-Verse",
      }),
  ).toHaveCount(0);
});

test("reminders inbox surfaces solo and group reminders with read and dismiss actions", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use my solo profile" }).click(),
  ]);
  await page.goto("/app/reminders");
  await expect(
    page.getByRole("heading", { name: "Reminders for Brendan" }),
  ).toBeVisible();
  const soloReminderCard = page.getByTestId("reminder-card-movie-16");
  await expect(
    soloReminderCard.getByRole("heading", { name: "Mad Max: Fury Road" }),
  ).toBeVisible();
  await expect(
    soloReminderCard.getByText("Saved to your watchlist and available on your services"),
  ).toBeVisible();
  await soloReminderCard.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("reminder-card-movie-16")).toHaveCount(0);

  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");
  await page.goto("/app/reminders");
  await expect(
    page.getByRole("heading", { name: "Reminders for Brendan + Palmer" }),
  ).toBeVisible();
  const groupReminderCard = page.getByTestId("reminder-card-movie-16");
  await expect(
    groupReminderCard.getByRole("heading", {
      name: "Mad Max: Fury Road",
    }),
  ).toBeVisible();
  await expect(
    groupReminderCard.getByText(
      "Saved by Brendan and available for Brendan and Palmer now",
    ),
  ).toBeVisible();
  await groupReminderCard.getByRole("button", { name: "Mark read" }).click();
  await expect(page.getByTestId("reminder-section-read")).toContainText(
    "Mad Max: Fury Road",
  );
});

test("reminder preferences save, load, and tune solo and group reminder noise", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/settings");
  await page.getByLabel("Available now reminders").click();
  await page.getByLabel("Watchlist resurfacing reminders").click();
  await page.getByLabel("Group reminders").click();
  await page.getByLabel("Dismissed reminders can return after a cooldown").click();
  await page.getByLabel("Reminder pace").click();
  await page.getByRole("option", { name: "Light" }).click();
  await page.getByRole("button", { name: "Save reminder preferences" }).click();
  await expect(page.getByText("Reminder preferences saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Available now reminders")).toHaveAttribute(
    "data-state",
    "unchecked",
  );
  await expect(page.getByLabel("Watchlist resurfacing reminders")).toHaveAttribute(
    "data-state",
    "unchecked",
  );
  await expect(page.getByLabel("Group reminders")).toHaveAttribute(
    "data-state",
    "unchecked",
  );
  await expect(
    page.getByLabel("Dismissed reminders can return after a cooldown"),
  ).toHaveAttribute("data-state", "checked");
  await expect(page.getByLabel("Reminder pace")).toContainText("Light");

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use my solo profile" }).click(),
  ]);
  await page.goto("/app/reminders");
  await expect(
    page.getByRole("heading", { name: "Reminders for Brendan" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("The reminder categories for this view are turned off in Settings.")
      .first(),
  ).toBeVisible();
  await expect(page.locator('[data-testid^="reminder-card-"]')).toHaveCount(0);

  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");
  await page.goto("/app/reminders");
  await expect(
    page.getByRole("heading", { name: "Reminders for Brendan + Palmer" }),
  ).toBeVisible();
  await expect(
    page.getByText("Group reminders are turned off in Settings.").first(),
  ).toBeVisible();
  await expect(page.locator('[data-testid^="reminder-card-"]')).toHaveCount(0);
});

test("library intelligence surfaces solo sections, provider-aware filters, and quick triage", async ({
  page,
}) => {
  await signInAs(page, GEOFF_EMAIL);
  await page.getByLabel("Solo profile").click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("option", { name: "Katie" }).click(),
  ]);

  await page.goto("/app/library");
  await expect(
    page.getByRole("heading", { name: "Decision workspace for Katie" }),
  ).toBeVisible();
  const availableSection = page.getByTestId("library-section-available_now");
  await expect(availableSection).toBeVisible();
  await expect(
    availableSection.getByRole("heading", { name: "Oppenheimer" }),
  ).toBeVisible();
  await expect(
    availableSection.locator("p.text-sm.font-medium.text-primary").first(),
  ).toContainText("Saved to your watchlist and available on your services");
  await expect(
    availableSection.getByText("Available now", { exact: true }).first(),
  ).toBeVisible();

  await page.goto("/app/library?collection=WATCHLIST&focus=available");
  const collectionCard = page.getByTestId("library-card-collection-movie-17");
  await expect(collectionCard).toBeVisible();
  await collectionCard.getByRole("button", { name: "Save for me" }).click();
  await expect(page.getByTestId("library-card-collection-movie-17")).toHaveCount(0);
});

test("shared watchlist saves stay distinct from personal watchlists and feed group resurfacing", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");

  await page.goto("/app/title/movie/11");
  await expect(page.getByText("No shared planning state")).toBeVisible();
  await expect(
    page.getByText(
      "This title is not currently saved for the active group or the household.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save for current group" }).click();
  await page.getByRole("button", { name: "Save for household" }).click();
  await expect(
    page.getByText("Saved for Brendan + Palmer by Brendan.").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Saved for the household by Brendan.").first(),
  ).toBeVisible();

  await page.goto("/app/library?collection=shared_group");
  await expect(page.getByTestId("library-section-collection")).toContainText("Dune");
  await expect(page.getByTestId("library-section-collection")).toContainText(
    "Saved for Brendan + Palmer",
  );

  await page.goto("/app/library?collection=WATCHLIST");
  await expect(
    page
      .getByTestId("library-section-collection")
      .getByRole("heading", { name: "Dune" }),
  ).toHaveCount(0);

  await page.goto("/app/library?collection=shared_household");
  await expect(page.getByTestId("library-section-collection")).toContainText("Dune");
  await expect(page.getByTestId("library-section-collection")).toContainText(
    "Saved by Brendan for the household",
  );

  await signOut(page);
  await signInAs(page, GEOFF_EMAIL);
  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");

  await page.goto("/app/title/movie/16");
  await page.getByRole("button", { name: "Save for current group" }).click();
  await page.goto("/app/reminders");
  const madMaxReminder = page.getByTestId("reminder-card-movie-16");
  await expect(
    madMaxReminder.getByRole("heading", { name: "Mad Max: Fury Road" }),
  ).toBeVisible();
  await expect(
    madMaxReminder.getByText("Saved for Brendan + Palmer and available now"),
  ).toBeVisible();

  await page.goto("/app/title/movie/16");
  await page.getByRole("button", { name: "Watched by current group" }).click();
  await page.goto("/app/reminders");
  await expect(page.getByTestId("reminder-card-movie-16")).toHaveCount(0);
});

test("library intelligence stays group-aware and moves watched-together titles out of fresh sections", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");

  await page.goto("/app/library");
  await expect(
    page.getByRole("heading", { name: "Decision workspace for Brendan + Palmer" }),
  ).toBeVisible();
  const groupAvailableCard = page.getByTestId("library-card-available_now-tv-104");
  await expect(groupAvailableCard).toBeVisible();
  await expect(
    groupAvailableCard.getByTestId(
      "library-card-available_now-tv-104-primary-explanation",
    ),
  ).toBeVisible();
  await expect(
    groupAvailableCard.getByTestId(
      "library-card-available_now-tv-104-primary-explanation",
    ),
  ).toContainText("Saved by Palmer and available for Brendan and Palmer now");
  await groupAvailableCard
    .getByRole("button", { name: "Watched by current group" })
    .click();

  await expect(page.getByTestId("library-card-available_now-tv-104")).toHaveCount(0);
  await expect(page.getByTestId("library-section-watched")).toContainText(
    "Only Murders in the Building",
  );
});

test("persisted solo profile context restores across refresh", async ({ page }) => {
  await signInAs(page, GEOFF_EMAIL);
  await page.goto("/app/household");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use my solo profile" }).click(),
  ]);
  await page.goto("/app");
  const currentHeading =
    (await page.getByRole("heading", { name: /^For / }).first().textContent()) ?? "";
  const targetProfile = currentHeading.includes("Katie") ? "Geoff" : "Katie";

  await page.getByLabel("Solo profile").click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("option", { name: targetProfile }).click(),
  ]);
  await expect(page.getByRole("heading", { name: `For ${targetProfile}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: `For ${targetProfile}` })).toBeVisible();
});

test("group watch sessions stay separate from solo watched history", async ({ page }) => {
  await signInAs(page, GEOFF_EMAIL);
  await page.goto("/app/household");
  await useSavedGroup(page, "Brendan + Palmer");
  await page.goto("/app/title/movie/12");
  await page.getByRole("button", { name: "Watched by current group" }).click();
  await expect(
    page.getByTestId("title-fit-summary"),
  ).toContainText("Brendan + Palmer already watched this together");

  await page.goto("/app/library?tab=WATCHED");
  const watchedCollection = page.getByTestId("library-section-collection");
  await expect(watchedCollection.getByRole("heading", { name: "Arrival" })).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use my solo profile" }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: "Decision workspace for Geoff" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("library-section-collection")
      .getByRole("heading", { name: "Arrival" }),
  ).toHaveCount(0);

  await page.goto("/app/title/movie/12");
  await ensureActiveButton(
    page.getByRole("button", { name: "Watched by me", exact: true }),
  );
  await page.goto("/app/library?tab=WATCHED");
  await expect(
    page
      .getByTestId("library-section-collection")
      .getByRole("heading", { name: "Arrival" }),
  ).toBeVisible();
});

test("Trakt linking shows imported sources clearly and lets users clear imported title state", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/household");
  await useSoloProfile(page);
  await page.goto("/app/settings");
  await expect(page.getByTestId("trakt-connection-status")).toContainText(
    "Not connected",
  );
  await page.getByRole("button", { name: "Connect Trakt" }).click();
  await expect(page).toHaveURL(/\/app\/settings/);
  await expect(page.getByTestId("trakt-connection-status")).toContainText(
    "Connected as brendan",
  );
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(
    page
      .getByTestId("trakt-integration-card")
      .getByText(/^Last successful sync:/),
  ).not.toContainText("Never synced");
  await expect(page.getByTestId("trakt-sync-review-headline")).toContainText(
    "Imported 2 watched titles, 1 watchlist item, and 1 rating.",
  );
  await expect(page.getByTestId("trakt-recent-imports")).toContainText(
    "Spider-Man: Into the Spider-Verse",
  );
  await expect(page.getByTestId("trakt-recommendation-impact")).toContainText(
    "Imported watched history helps ScreenLantern avoid resurfacing titles you have already seen.",
  );
  await expect(page.getByTestId("trakt-disconnect-note")).toContainText(
    "Disconnecting Trakt stops future syncs, but imported personal data already in ScreenLantern stays until you clear or change it.",
  );

  await page.goto("/app/library?collection=WATCHED");
  await expect(
    page
      .getByTestId("library-section-collection")
      .getByRole("heading", { name: "Spider-Man: Into the Spider-Verse" }),
  ).toBeVisible();
  await page.goto("/app/library?collection=WATCHED&source=imported");
  const importedWatchedCard = page.getByTestId("library-card-collection-movie-18");
  await expect(importedWatchedCard).toBeVisible();
  await expect(importedWatchedCard).toContainText("Imported from Trakt");

  await page.goto("/app/library?collection=WATCHLIST");
  await expect(
    page
      .getByTestId("library-section-collection")
      .getByRole("heading", { name: "Ted Lasso" }),
  ).toBeVisible();

  await page.goto("/app/library?collection=LIKE");
  await expect(
    page
      .getByTestId("library-section-collection")
      .getByRole("heading", { name: "Palm Springs" }),
  ).toBeVisible();

  await page.goto("/app/title/movie/18");
  await expect(page.getByTestId("title-personal-state-watched")).toContainText(
    "Watched via Trakt sync",
  );
  await page.getByRole("button", { name: "Remove imported watched state" }).click();
  await expect(page.getByTestId("title-personal-state-watched")).toHaveCount(0);

  await page.goto("/app/title/tv/107");
  await expect(page.getByTestId("title-personal-state-watchlist")).toContainText(
    "Imported from Trakt watchlist",
  );
  await page.getByRole("button", { name: "Remove imported watchlist" }).click();
  await expect(page.getByTestId("title-personal-state-watchlist")).toHaveCount(0);

  await page.goto("/app/title/movie/15");
  await expect(page.getByTestId("title-personal-state-like")).toContainText(
    "Liked via Trakt ratings",
  );
  await ensureActiveButton(
    page.getByRole("button", { name: "Save for me", exact: true }),
  );
  await expect(page.getByTestId("title-personal-state-watchlist")).toContainText(
    "Added in ScreenLantern",
  );
  await page.getByRole("button", { name: "Remove imported rating signal" }).click();
  await expect(page.getByTestId("title-personal-state-like")).toHaveCount(0);
  await expect(page.getByTestId("title-personal-state-watchlist")).toContainText(
    "Added in ScreenLantern",
  );

  const secondSyncResponse = await page.context().request.post(
    "/api/integrations/trakt/sync",
  );
  const secondSyncPayload = (await secondSyncResponse.json()) as {
    result: {
      imported: {
        watched: number;
        watchlist: number;
        likes: number;
        dislikes: number;
      };
      cleared: {
        watched: number;
        watchlist: number;
        ratings: number;
      };
    };
  };
  expect(secondSyncResponse.ok()).toBeTruthy();
  expect(secondSyncPayload.result.imported.watched).toBe(0);
  expect(secondSyncPayload.result.imported.watchlist).toBe(0);
  expect(secondSyncPayload.result.imported.likes).toBe(0);
  expect(secondSyncPayload.result.cleared.watched).toBe(0);
  expect(secondSyncPayload.result.cleared.watchlist).toBe(0);
  expect(secondSyncPayload.result.cleared.ratings).toBe(0);

  await page.goto("/app/settings");
  await expect(page.getByTestId("trakt-sync-review-headline")).toContainText(
    "No new Trakt changes found.",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Disconnect Trakt" }).click();
  await expect(page.getByTestId("trakt-connection-status")).toContainText(
    "Not connected",
  );
  await expect(page.getByTestId("trakt-import-rules")).toContainText(
    "Disconnecting Trakt stops future syncs but keeps already imported personal data unless you clear it from a title detail page or change it manually.",
  );

  await page.goto("/app/library?collection=WATCHED");
  await expect(
    page
      .getByTestId("library-section-collection")
      .getByRole("heading", { name: "Only Murders in the Building" }),
  ).toBeVisible();
});

test("Trakt sync freshness settings persist and opportunistic app-open sync keeps imports current", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
  await page.goto("/app/settings");
  await page.getByRole("button", { name: "Connect Trakt" }).click();
  await expect(page.getByTestId("trakt-connection-status")).toContainText(
    "Connected as brendan",
  );
  await expect(page.getByTestId("trakt-freshness-state")).toContainText(
    "never synced",
  );
  const saveModeResponse = await page.context().request.post("/api/settings/trakt", {
    data: {
      syncMode: "ON_LOGIN_OR_APP_OPEN",
    },
  });
  expect(saveModeResponse.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText("Sync mode: On sign in or app open")).toBeVisible();
  await expect(page.getByTestId("trakt-last-sync-trigger")).toContainText(
    "automatic sync",
  );
  await expect(
    page.getByTestId("trakt-integration-card").getByText(/^Last successful sync:/),
  ).not.toContainText("Never synced");
  await page.goto("/app/library?collection=WATCHLIST&source=imported");
  await expect(
    page
      .getByTestId("library-section-collection")
      .getByRole("heading", { name: "Ted Lasso" }),
  ).toBeVisible();

  await signOut(page);

  const autoSyncResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/integrations/trakt/sync/auto") &&
      response.request().method() === "POST",
  );
  await signInAs(page, DEMO_EMAIL);
  const autoSyncResponse = await autoSyncResponsePromise;
  const autoSyncPayload = (await autoSyncResponse.json()) as {
    result: {
      outcome: string;
      reason: string;
    };
  };
  expect(autoSyncPayload.result.outcome).toBe("skipped");
  expect(autoSyncPayload.result.reason).toBe("fresh_enough");

  await page.goto("/app/settings");
  await expect(page.getByText("Sync mode: On sign in or app open")).toBeVisible();
  await expect(page.getByTestId("trakt-last-sync-trigger")).toContainText(
    "automatic sync",
  );
  await expect(
    page.getByTestId("trakt-integration-card").getByText(/^Last successful sync:/),
  ).not.toContainText("Never synced");

  const secondAutoSyncResponse = await page.context().request.post(
    "/api/integrations/trakt/sync/auto",
  );
  const secondAutoSyncPayload = (await secondAutoSyncResponse.json()) as {
    result: {
      outcome: string;
      reason: string;
    };
  };
  expect(secondAutoSyncPayload.result.outcome).toBe("skipped");
  expect(secondAutoSyncPayload.result.reason).toBe("fresh_enough");

  await page.goto("/app/settings");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Disconnect Trakt" }).click();
  await expect(page.getByTestId("trakt-connection-status")).toContainText(
    "Not connected",
  );
});

test("membership listing and owner invite creation work", async ({ page }) => {
  await signInAs(page);
  await page.goto("/app/household");
  await expect(page.getByText("brendan@screenlantern.demo", { exact: true })).toBeVisible();
  await expect(page.getByText("katie@screenlantern.demo", { exact: true })).toBeVisible();
  await expect(page.getByText("palmer@screenlantern.demo", { exact: true })).toBeVisible();
  await expect(page.getByText("geoff@screenlantern.demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByText("Latest invite code")).toBeVisible();
});

test("invite creation is protected for anonymous and member users", async ({
  page,
  request,
}) => {
  const anonymousResponse = await request.post("/api/household/invites", {
    data: { expiresInDays: 7 },
  });
  expect(anonymousResponse.status()).toBe(401);

  await signInAs(page, MEMBER_EMAIL);
  const memberResponse = await page.context().request.post(
    "/api/household/invites",
    {
      data: { expiresInDays: 7 },
    },
  );
  expect(memberResponse.status()).toBe(403);
});

test("recommendation context and group watch endpoints are protected and validated", async ({
  page,
  request,
}) => {
  const anonymousInteractionResponse = await request.post("/api/interactions", {
    data: {
      title: ARRIVAL_TITLE,
      interactionType: "WATCHLIST",
      active: true,
      actingUserId: "not-real-user",
    },
  });
  expect(anonymousInteractionResponse.status()).toBe(401);

  const anonymousReminderResponse = await request.get("/api/reminders");
  expect(anonymousReminderResponse.status()).toBe(401);

  const anonymousReadResponse = await request.post(
    "/api/reminders/not-real-reminder/read",
  );
  expect(anonymousReadResponse.status()).toBe(401);

  const anonymousContextResponse = await request.post("/api/recommendation-context", {
    data: {
      mode: "GROUP",
      selectedUserIds: ["brendan", "palmer"],
    },
  });
  expect(anonymousContextResponse.status()).toBe(401);

  const anonymousGroupWatchResponse = await request.post("/api/watch-sessions", {
    data: {
      title: ARRIVAL_TITLE,
    },
  });
  expect(anonymousGroupWatchResponse.status()).toBe(401);

  const anonymousSharedSaveResponse = await request.post("/api/shared-watchlist", {
    data: {
      title: DUNE_TITLE,
      scope: "GROUP",
      active: true,
    },
  });
  expect(anonymousSharedSaveResponse.status()).toBe(401);

  await signInAs(page, GEOFF_EMAIL);
  const invalidContextResponse = await page.context().request.post(
    "/api/recommendation-context",
    {
      data: {
        mode: "GROUP",
        selectedUserIds: ["not-real-member", "still-not-real"],
      },
    },
  );
  expect(invalidContextResponse.status()).toBe(400);

  await page.getByRole("button", { name: "Use my solo profile" }).click();
  await expect(page.getByRole("heading", { name: "For Geoff" })).toBeVisible();

  const invalidReminderResponse = await page.context().request.post(
    "/api/reminders/not-real-reminder/read",
  );
  expect(invalidReminderResponse.status()).toBe(404);

  const invalidActorResponse = await page.context().request.post(
    "/api/interactions",
    {
      data: {
        title: ARRIVAL_TITLE,
        interactionType: "WATCHLIST",
        active: true,
        actingUserId: "not-real-user",
      },
    },
  );
  expect(invalidActorResponse.status()).toBe(403);

  const invalidSharedActorResponse = await page.context().request.post(
    "/api/shared-watchlist",
    {
      data: {
        title: DUNE_TITLE,
        scope: "HOUSEHOLD",
        active: true,
        actingUserId: "not-real-user",
      },
    },
  );
  expect(invalidSharedActorResponse.status()).toBe(403);

  const soloGroupWatchResponse = await page.context().request.post(
    "/api/watch-sessions",
    {
      data: {
        title: ARRIVAL_TITLE,
      },
    },
  );
  expect(soloGroupWatchResponse.status()).toBe(400);

  const soloGroupSharedSaveResponse = await page.context().request.post(
    "/api/shared-watchlist",
    {
      data: {
        title: DUNE_TITLE,
        scope: "GROUP",
        active: true,
      },
    },
  );
  expect(soloGroupSharedSaveResponse.status()).toBe(400);
});

test("owner transfer updates governance and preserves invite management", async ({
  page,
}) => {
  const ownerName = "Taylor";
  const nextOwnerName = "Morgan";
  const ownerEmail = uniqueEmail("governance-owner");
  const nextOwnerEmail = uniqueEmail("governance-member");

  await page.goto("/sign-up");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(ownerName);
  await page
    .getByRole("textbox", { name: "Household name", exact: true })
    .fill("Governance House");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/household");
  await expect(
    page.getByText(new RegExp(`Current owner: ${ownerName} \\(${ownerEmail}\\)`)),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByText("Latest invite code")).toBeVisible();
  const inviteCode = await page.locator("#invite-code").inputValue();
  expect(inviteCode).not.toBe("");

  await signOut(page);

  await page.goto(`/sign-up?invite=${inviteCode}`);
  await expect(page.getByText("Active invite")).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(nextOwnerName);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(nextOwnerEmail);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Join household" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/household");
  await expect(page.getByText(/You are in this household as MEMBER/i)).toBeVisible();

  await signOut(page);

  await signInAs(page, ownerEmail);
  await page.goto("/app/household");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Transfer ownership" }).click();
  await expect(
    page.getByText(new RegExp(`Current owner: ${nextOwnerName} \\(${nextOwnerEmail}\\)`)),
  ).toBeVisible();
  await expect(page.getByText(/You are in this household as MEMBER/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create invite" })).toHaveCount(0);
  await expect(page.getByText(inviteCode, { exact: true })).toBeVisible();

  const downgradedInviteResponse = await page.context().request.post(
    "/api/household/invites",
    {
      data: { expiresInDays: 7 },
    },
  );
  expect(downgradedInviteResponse.status()).toBe(403);

  await signOut(page);

  await signInAs(page, nextOwnerEmail);
  await page.goto("/app/household");
  await expect(
    page.getByText(new RegExp(`Current owner: ${nextOwnerName} \\(${nextOwnerEmail}\\)`)),
  ).toBeVisible();
  await expect(page.getByText(inviteCode, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByText("Latest invite code")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove member" }).click();
  await expect(page.getByText(ownerEmail, { exact: true })).toHaveCount(0);
});

test("owner transfer endpoint is protected and validates targets", async ({
  page,
  request,
}) => {
  const anonymousResponse = await request.post("/api/household/owner/transfer", {
    data: { memberId: "not-real-member" },
  });
  expect(anonymousResponse.status()).toBe(401);

  await signInAs(page, MEMBER_EMAIL);
  const memberResponse = await page.context().request.post(
    "/api/household/owner/transfer",
    {
      data: { memberId: "not-real-member" },
    },
  );
  expect(memberResponse.status()).toBe(403);

  await signOut(page);

  await signInAs(page, DEMO_EMAIL);
  const invalidTargetResponse = await page.context().request.post(
    "/api/household/owner/transfer",
    {
      data: { memberId: "not-real-member" },
    },
  );
  expect(invalidTargetResponse.status()).toBe(400);
});

test("activity feed surfaces shared planning, watched-together, invite, and governance history", async ({
  page,
}) => {
  const ownerName = "Avery";
  const memberName = "Jordan";
  const ownerEmail = uniqueEmail("activity-owner");
  const memberEmail = uniqueEmail("activity-member");

  await page.goto("/sign-up");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(ownerName);
  await page
    .getByRole("textbox", { name: "Household name", exact: true })
    .fill("Activity House");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.goto("/app/household");
  await page.getByRole("button", { name: "Create invite" }).click();
  await expect(page.getByText("Latest invite code")).toBeVisible();
  const inviteCode = await page.locator("#invite-code").inputValue();

  await signOut(page);

  await page.goto(`/sign-up?invite=${inviteCode}`);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(memberName);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(memberEmail);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Join household" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await signOut(page);

  await signInAs(page, ownerEmail);
  await page.goto("/app/household");
  await page.getByRole("textbox", { name: "Group name" }).fill("Activity Duo");
  await page.locator("label").filter({ hasText: ownerName }).click();
  await page.locator("label").filter({ hasText: memberName }).click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/household/groups") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Save and activate group" }).click(),
  ]);

  await page.goto("/app/title/movie/11");
  await page.getByRole("button", { name: "Save for current group" }).click();
  await page.getByRole("button", { name: "Save for current group" }).click();

  await page.goto("/app/title/movie/12");
  await page.getByRole("button", { name: "Watched by current group" }).click();

  await page.goto("/app/household");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Transfer ownership" }).click();

  await signOut(page);

  await signInAs(page, memberEmail);
  await page.goto("/app/household");
  await page.getByRole("button", { name: "Create invite" }).click();
  const secondInviteCode = await page.locator("#invite-code").inputValue();
  expect(secondInviteCode).not.toBe("");
  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/household/invites/") &&
        response.url().includes("/revoke") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Revoke invite" }).click(),
  ]);

  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/household/members/") &&
        response.request().method() === "DELETE",
    ),
    page.getByRole("button", { name: "Remove member" }).click(),
  ]);

  await page.goto("/app/activity");
  await expect(
    page.getByRole("heading", { name: "Household history for Activity House" }),
  ).toBeVisible();
  await expect(page.getByText(`${ownerName} created a household invite`)).toBeVisible();
  await expect(page.getByText(`${memberName} joined the household`)).toBeVisible();
  await expect(
    page.getByText(`${ownerName} saved Dune for ${ownerName} + ${memberName}`),
  ).toBeVisible();
  await expect(
    page.getByText(`${ownerName} removed Dune from ${ownerName} + ${memberName}`),
  ).toBeVisible();
  await expect(
    page.getByText(`${ownerName} and ${memberName} watched Arrival together`),
  ).toBeVisible();
  await expect(
    page.getByText(`Ownership transferred from ${ownerName} to ${memberName}`),
  ).toBeVisible();
  await expect(page.getByText(`${memberName} revoked an invite`)).toBeVisible();
  await expect(
    page.getByText(`${memberName} removed ${ownerName} from the household`),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open Dune" }).first().click();
  await expect(page).toHaveURL(/\/app\/title\/movie\/11$/);
});
