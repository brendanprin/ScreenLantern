import { expect, test, type Page } from "@playwright/test";

const DEMO_EMAIL = "brendan@screenlantern.demo";
const DEMO_PASSWORD = "screenlantern-demo";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function ensureActiveButton(button: ReturnType<Page["getByRole"]>) {
  const classes = (await button.getAttribute("class")) ?? "";

  if (!classes.includes("bg-primary")) {
    await button.click();
  }

  await expect(button).toHaveClass(/bg-primary/);
}

test("redirects anonymous users away from protected routes", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("search and detail flow works", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/search?query=Dune&mediaType=all");
  await expect(page.getByText('1 result for "Dune"')).toBeVisible();
  await page.getByRole("link", { name: "Dune" }).first().click();
  await expect(page.getByRole("heading", { name: "Dune" })).toBeVisible();
  await expect(page.getByText("Where to watch")).toBeVisible();
});

test("watchlist and taste actions work on a title detail page", async ({ page }) => {
  await signIn(page);
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
  await signIn(page);
  await page.goto("/app/household");
  await page.getByRole("button", { name: "Use this group" }).nth(1).click();
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Recommendations for Brendan + Palmer" }),
  ).toBeVisible();
});
