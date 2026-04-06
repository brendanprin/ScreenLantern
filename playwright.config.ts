import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --hostname localhost --port 3100",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...process.env,
      NEXTAUTH_URL: "http://localhost:3100",
      TMDB_USE_MOCK_DATA: "1",
      TRAKT_USE_MOCK_DATA: "1",
      TRAKT_REDIRECT_URI: "http://localhost:3100/api/integrations/trakt/callback",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
