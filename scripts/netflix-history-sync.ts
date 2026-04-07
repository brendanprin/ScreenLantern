#!/usr/bin/env node

/**
 * CLI wrapper for Netflix history sync.
 *
 * setup  — opens a real browser window for first-time Netflix login and saves
 *           the session to .netflix-sync/storage-state.json
 *
 * sync   — runs a one-shot headless sync and exits. Prefer using the
 *           streaming-sync sidecar (npm run docker:dev:up) for scheduled sync.
 */

import { stdout as output } from "node:process";

import {
  readNetflixSyncConfig,
  runNetflixSetup,
  runNetflixSync,
} from "../streaming-sync/netflix";

async function main() {
  const mode = process.argv[2] === "setup" ? "setup" : "sync";
  const config = readNetflixSyncConfig();

  if (mode === "setup") {
    await runNetflixSetup(config);
    return;
  }

  const outcome = await runNetflixSync(config);

  if (!outcome.ok) {
    output.write(`Netflix sync failed: ${outcome.error}\n`);
    process.exitCode = 1;
    return;
  }

  output.write(`${outcome.summary}\n`);

  if (outcome.result.unmatchedTitles.length > 0) {
    output.write(`Unmatched titles: ${outcome.result.unmatchedTitles.join(", ")}\n`);
  }
}

main().catch((error) => {
  output.write(
    `${error instanceof Error ? error.message : "Netflix sync failed unexpectedly."}\n`,
  );
  process.exitCode = 1;
});
