import { access, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  parseNetflixViewingHistoryCsv,
  summarizeNetflixHistoryImport,
} from "../src/lib/services/netflix-history-shared";
import type { NetflixHistoryImportResult } from "../src/lib/services/netflix-history-shared";

const NETFLIX_VIEWING_ACTIVITY_URL = "https://www.netflix.com/viewingactivity";

export interface NetflixSyncConfig {
  internalUrl: string;
  internalSyncSecret: string;
  userEmail: string;
  profileName: string | null;
  userDataDir: string;
  storageStatePath: string;
  downloadDir: string;
  headless: boolean;
}

export interface NetflixSyncResult {
  ok: true;
  result: NetflixHistoryImportResult;
  summary: string;
}

export interface NetflixSyncError {
  ok: false;
  error: string;
}

export function readNetflixSyncConfig(): NetflixSyncConfig {
  return {
    internalUrl:
      process.env.SCREENLANTERN_INTERNAL_URL ??
      process.env.NEXTAUTH_URL ??
      "http://localhost:3000",
    internalSyncSecret: process.env.INTERNAL_SYNC_SECRET ?? "",
    userEmail: process.env.NETFLIX_SYNC_USER_EMAIL ?? "",
    profileName: process.env.NETFLIX_SYNC_PROFILE_NAME?.trim() || null,
    userDataDir:
      process.env.NETFLIX_SYNC_USER_DATA_DIR ?? path.resolve(".netflix-sync/profile"),
    storageStatePath:
      process.env.NETFLIX_SYNC_STORAGE_STATE_PATH ??
      path.resolve(".netflix-sync/storage-state.json"),
    downloadDir:
      process.env.NETFLIX_SYNC_DOWNLOAD_DIR ?? path.resolve(".netflix-sync/downloads"),
    headless: process.env.NETFLIX_SYNC_HEADLESS !== "0",
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findVisibleLocator(locators: Locator[]) {
  for (const locator of locators) {
    if (await locator.first().isVisible().catch(() => false)) {
      return locator.first();
    }
  }
  return null;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function maybeSelectNetflixProfile(page: Page, profileName: string | null) {
  const profilePromptVisible = await page
    .getByText(/who'?s watching\??/i)
    .isVisible()
    .catch(() => false);

  if (!profilePromptVisible) {
    return;
  }

  if (profileName) {
    const namedProfile = await findVisibleLocator([
      page.getByRole("link", { name: new RegExp(`^${escapeRegExp(profileName)}$`, "i") }),
      page.getByText(new RegExp(`^${escapeRegExp(profileName)}$`, "i")),
    ]);

    if (namedProfile) {
      await namedProfile.click();
      return;
    }
  }

  const firstProfile = await findVisibleLocator([
    page.locator("a[href*='/browse']").first(),
    page.locator("[data-uia='profile-link']").first(),
  ]);

  if (firstProfile) {
    await firstProfile.click();
  }
}

function isNetflixLoginPage(page: Page) {
  return page.url().includes("/login");
}

async function openViewingActivityPage(
  page: Page,
  profileName: string | null,
  options?: { allowLoginRedirect?: boolean },
) {
  await page.goto(NETFLIX_VIEWING_ACTIVITY_URL, { waitUntil: "domcontentloaded" });

  if (options?.allowLoginRedirect && isNetflixLoginPage(page)) {
    return;
  }

  await maybeSelectNetflixProfile(page, profileName);
  await page.goto(NETFLIX_VIEWING_ACTIVITY_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);

  if (!options?.allowLoginRedirect && isNetflixLoginPage(page)) {
    throw new Error(
      "Netflix is not logged in. Run netflix:setup first to save a browser session.",
    );
  }
}

async function findDownloadLocator(page: Page) {
  return findVisibleLocator([
    page.getByRole("link", { name: /download all/i }),
    page.getByRole("button", { name: /download all/i }),
    page.locator("a[href*='viewingactivitycsv']"),
    page.locator("a").filter({ hasText: /download all/i }),
  ]);
}

interface NetflixBrowserSession {
  context: BrowserContext;
  close: () => Promise<void>;
}

async function launchNetflixSession(
  config: NetflixSyncConfig,
  mode: "sync" | "setup",
): Promise<NetflixBrowserSession> {
  const viewport = { width: 1440, height: 960 };

  if (mode === "sync" && (await fileExists(config.storageStatePath))) {
    const browser: Browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport,
      storageState: config.storageStatePath,
    });

    return {
      context,
      close: async () => {
        await context.storageState({ path: config.storageStatePath });
        await browser.close();
      },
    };
  }

  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    acceptDownloads: true,
    viewport,
  });

  return {
    context,
    close: async () => {
      await context.storageState({ path: config.storageStatePath });
      await context.close();
    },
  };
}

export async function runNetflixSetup(config: NetflixSyncConfig): Promise<void> {
  await mkdir(config.userDataDir, { recursive: true });
  await mkdir(config.downloadDir, { recursive: true });
  await mkdir(path.dirname(config.storageStatePath), { recursive: true });

  // Setup always needs a visible browser so the user can log in.
  const session = await launchNetflixSession({ ...config, headless: false }, "setup");

  try {
    const page = session.context.pages()[0] ?? (await session.context.newPage());
    await openViewingActivityPage(page, config.profileName, { allowLoginRedirect: true });

    output.write(
      `Netflix setup browser is ready.\nIf Netflix opened a login or challenge page, finish it now.\nWhen fully signed in, press Enter here.\n`,
    );

    if (input.isTTY) {
      const rl = createInterface({ input, output });
      await rl.question("");
      rl.close();
    }

    await openViewingActivityPage(page, config.profileName);
    const downloadLocator = await findDownloadLocator(page);

    if (!downloadLocator) {
      throw new Error(
        "Viewing activity loaded but ScreenLantern could not find the Download all control.",
      );
    }

    await session.context.storageState({ path: config.storageStatePath });
    output.write(`Setup complete. Login state saved to ${config.storageStatePath}.\n`);
  } finally {
    await session.close();
  }
}

export async function runNetflixSync(
  config: NetflixSyncConfig,
): Promise<NetflixSyncResult | NetflixSyncError> {
  if (!config.internalSyncSecret) {
    return { ok: false, error: "INTERNAL_SYNC_SECRET is not configured." };
  }

  if (!config.userEmail) {
    return { ok: false, error: "NETFLIX_SYNC_USER_EMAIL is not configured." };
  }

  await mkdir(config.downloadDir, { recursive: true });
  await mkdir(path.dirname(config.storageStatePath), { recursive: true });

  const session = await launchNetflixSession(config, "sync");

  try {
    const page = session.context.pages()[0] ?? (await session.context.newPage());
    await openViewingActivityPage(page, config.profileName);

    const downloadLocator = await findDownloadLocator(page);
    if (!downloadLocator) {
      return {
        ok: false,
        error: "Viewing activity loaded but ScreenLantern could not find the Download all control.",
      };
    }

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadLocator.click(),
    ]);

    const filename = download.suggestedFilename() || `netflix-history-${Date.now()}.csv`;
    const downloadPath = path.join(config.downloadDir, filename);
    await download.saveAs(downloadPath);

    try {
      const csv = await readFile(downloadPath, "utf8");
      const entries = parseNetflixViewingHistoryCsv(csv);

      if (entries.length === 0) {
        return { ok: false, error: "CSV downloaded but contained no rows." };
      }

      const response = await fetch(`${config.internalUrl}/api/internal/imports/netflix`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.internalSyncSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userEmail: config.userEmail, entries }),
      });

      const payload = (await response.json()) as {
        error?: string;
        result?: NetflixHistoryImportResult;
        summary?: string;
      };

      if (!response.ok || !payload.result) {
        return {
          ok: false,
          error: payload.error ?? "ScreenLantern rejected the Netflix import.",
        };
      }

      return {
        ok: true,
        result: payload.result,
        summary: payload.summary ?? summarizeNetflixHistoryImport(payload.result),
      };
    } finally {
      await rm(downloadPath, { force: true });
    }
  } finally {
    await session.close();
  }
}
