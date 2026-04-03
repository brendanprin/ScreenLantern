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

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

test("redirects anonymous users away from protected routes", async ({ page }) => {
  await page.goto("/app");
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
});

test("watchlist and taste actions work on a title detail page", async ({ page }) => {
  await signInAs(page);
  await page.goto("/app/title/movie/12");
  const watchlistButton = page.getByRole("button", {
    name: "Watchlist",
    exact: true,
  });
  const likeButton = page.getByRole("button", { name: "Like", exact: true });

  await ensureActiveButton(watchlistButton);
  await ensureActiveButton(likeButton);

  await page.goto("/app/library?tab=WATCHLIST");
  await expect(page.getByRole("heading", { name: "Arrival" })).toBeVisible();
  await page.goto("/app/library?tab=LIKE");
  await expect(page.getByRole("heading", { name: "Arrival" })).toBeVisible();
});

test("group recommendation happy path is visible from household mode", async ({
  page,
}) => {
  await signInAs(page, GEOFF_EMAIL);
  await page.goto("/app/household");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use this group" }).nth(1).click(),
  ]);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Recommendations for Brendan + Palmer" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Recommendations for Brendan + Palmer" }),
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
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use this group" }).nth(1).click(),
  ]);
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

test("watchlist resurfacing lanes highlight available-now picks and suppress watched group titles", async ({
  page,
}) => {
  await signInAs(page, DEMO_EMAIL);
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
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use this group" }).nth(1).click(),
  ]);
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

test("persisted solo profile context restores across refresh", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "For Katie" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "For Katie" })).toBeVisible();
});

test("group watch sessions stay separate from solo watched history", async ({ page }) => {
  await signInAs(page, GEOFF_EMAIL);
  await page.goto("/app/household");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/recommendation-context") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Use this group" }).nth(1).click(),
  ]);
  await page.goto("/app/title/movie/12");
  await page.getByRole("button", { name: "Watched by current group" }).click();
  await expect(
    page.getByText(/Brendan \+ Palmer already watched this together/i),
  ).toBeVisible();

  await page.goto("/app/library?tab=WATCHED");
  await expect(page.getByRole("heading", { name: "Arrival" })).toHaveCount(0);

  await page.goto("/app/title/movie/12");
  await ensureActiveButton(
    page.getByRole("button", { name: "Watched by me", exact: true }),
  );
  await page.goto("/app/library?tab=WATCHED");
  await expect(page.getByRole("heading", { name: "Arrival" })).toBeVisible();
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

  const soloGroupWatchResponse = await page.context().request.post(
    "/api/watch-sessions",
    {
      data: {
        title: ARRIVAL_TITLE,
      },
    },
  );
  expect(soloGroupWatchResponse.status()).toBe(400);
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
