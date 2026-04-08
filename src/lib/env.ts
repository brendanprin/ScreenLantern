import { z } from "zod";

const envSchema = z.object({
  // Required — startup fails without these
  AUTH_SECRET: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  // Optional with defaults
  NEXTAUTH_URL: z.string().default("http://localhost:3000"),
  AI_PROVIDER: z.string().default("openai"),

  // Optional
  AI_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  AI_USE_MOCK_DATA: z.string().optional(),

  TMDB_API_KEY: z.string().optional(),
  TMDB_WATCH_REGION: z.string().default("US"),
  TMDB_USE_MOCK_DATA: z.string().optional(),

  TRAKT_ENCRYPTION_KEY: z.string().optional(),
  TRAKT_CLIENT_ID: z.string().optional(),
  TRAKT_CLIENT_SECRET: z.string().optional(),
  TRAKT_REDIRECT_URI: z.string().optional(),
  TRAKT_USE_MOCK_DATA: z.string().optional(),

  INTERNAL_SYNC_SECRET: z.string().optional(),
  STREAMING_SYNC_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

// During `next build`, env vars aren't available (injected at container runtime).
// Skip throwing so the build completes; misconfigured deploys will still fail at startup.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!parsed.success && !isBuildPhase) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Missing or invalid environment variables:\n${issues}`);
}

const _env = parsed.data ?? ({} as ReturnType<typeof envSchema.parse>);

export const env = {
  authSecret: _env.AUTH_SECRET,
  databaseUrl: _env.DATABASE_URL,
  nextAuthUrl: _env.NEXTAUTH_URL,
  aiProvider: _env.AI_PROVIDER,
  aiBaseUrl: _env.AI_BASE_URL,
  aiApiKey: _env.AI_API_KEY ?? _env.OPENAI_API_KEY,
  aiModel: _env.AI_MODEL ?? _env.OPENAI_MODEL,
  openAiApiKey: _env.OPENAI_API_KEY,
  openAiModel: _env.OPENAI_MODEL,
  aiUseMockData: _env.AI_USE_MOCK_DATA === "1",
  tmdbApiKey: _env.TMDB_API_KEY,
  tmdbWatchRegion: _env.TMDB_WATCH_REGION,
  tmdbUseMockData: _env.TMDB_USE_MOCK_DATA === "1" || !_env.TMDB_API_KEY,
  traktEncryptionKey: _env.TRAKT_ENCRYPTION_KEY,
  traktClientId: _env.TRAKT_CLIENT_ID,
  traktClientSecret: _env.TRAKT_CLIENT_SECRET,
  traktRedirectUri:
    _env.TRAKT_REDIRECT_URI ??
    `${_env.NEXTAUTH_URL}/api/integrations/trakt/callback`,
  traktUseMockData: _env.TRAKT_USE_MOCK_DATA === "1",
  internalSyncSecret: _env.INTERNAL_SYNC_SECRET ?? _env.AUTH_SECRET,
  streamingSyncUrl: _env.STREAMING_SYNC_URL ?? null,
};
