export const env = {
  authSecret: process.env.AUTH_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  nextAuthUrl: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  tmdbApiKey: process.env.TMDB_API_KEY,
  tmdbWatchRegion: process.env.TMDB_WATCH_REGION ?? "US",
  tmdbUseMockData:
    process.env.TMDB_USE_MOCK_DATA === "1" || !process.env.TMDB_API_KEY,
};

