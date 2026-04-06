import { getCurrentUserContext } from "@/lib/auth";
import { PaginationNav } from "@/components/pagination-nav";
import { TitleCard } from "@/components/title-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  discoverTitles,
  getGenreOptions,
  getProviderOptions,
} from "@/lib/services/catalog";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";
import { discoverParamsSchema } from "@/lib/validations/catalog";

interface BrowsePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildBrowseHref(params: Record<string, string | number>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== "") {
      search.set(key, String(value));
    }
  });

  return `/app/browse?${search.toString()}`;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const user = await getCurrentUserContext();
  const contextBootstrap = await getRecommendationContextBootstrap({
    userId: user.userId,
    householdId: user.householdId,
  });
  const parsed = discoverParamsSchema.parse(await searchParams);
  const results = await discoverTitles({
    page: parsed.page,
    mediaType: parsed.mediaType,
    genre: parsed.genre || undefined,
    year: typeof parsed.year === "number" ? parsed.year : undefined,
    runtimeMax: typeof parsed.runtimeMax === "number" ? parsed.runtimeMax : undefined,
    provider: parsed.provider || undefined,
    sortBy: parsed.sortBy,
  });

  const [genres, providers] = await Promise.all([
    getGenreOptions(parsed.mediaType),
    getProviderOptions(parsed.mediaType),
  ]);
  const contextLabel =
    contextBootstrap.context.activeNames.length > 0
      ? contextBootstrap.context.activeNames.join(" + ")
      : user.name;

  const yearPlaceholder =
    parsed.mediaType === "movie" ? "Release year" : "First air year";
  const runtimePlaceholder =
    parsed.mediaType === "movie" ? "Max runtime (minutes)" : "Max episode runtime";

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Browse</p>
          <CardTitle>Discover a better shortlist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Browsing for {contextLabel}. Use filters to narrow the shortlist, then open
            a title to compare fit, save it, or head to a service.
          </p>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={parsed.mediaType}
              name="mediaType"
            >
              <option value="movie">Movies</option>
              <option value="tv">Series</option>
            </select>
            <select
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={parsed.genre}
              name="genre"
            >
              <option value="">Any genre</option>
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
            <select
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={parsed.provider}
              name="provider"
            >
              <option value="">Any provider</option>
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
            <input
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={typeof parsed.year === "number" ? parsed.year : ""}
              name="year"
              placeholder={yearPlaceholder}
              type="number"
            />
            <input
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={typeof parsed.runtimeMax === "number" ? parsed.runtimeMax : ""}
              name="runtimeMax"
              placeholder={runtimePlaceholder}
              type="number"
            />
            <select
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={parsed.sortBy}
              name="sortBy"
            >
              <option value="popularity.desc">Most popular</option>
              <option value="vote_average.desc">Best rated</option>
              <option value="newest.desc">Newest first</option>
            </select>
            <button className="rounded-full bg-primary px-4 py-2 text-primary-foreground xl:col-span-2">
              Update results
            </button>
          </form>
        </CardContent>
      </Card>

      {results.notice ? (
        <Card className="border-amber-200 bg-amber-50/80">
          <CardContent className="p-4 text-sm text-amber-900">
            {results.notice}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5">
        {results.results.map((title) => (
          <TitleCard
            key={`${title.mediaType}-${title.tmdbId}`}
            title={title}
            showActions={false}
          />
        ))}
      </div>

      {results.results.length === 0 ? (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No titles matched these filters. Try broadening the year, runtime, or provider selections.
          </CardContent>
        </Card>
      ) : null}

      <PaginationNav
        page={results.page}
        totalPages={results.totalPages}
        buildHref={(page) =>
          buildBrowseHref({
            page,
            mediaType: parsed.mediaType,
            genre: parsed.genre,
            provider: parsed.provider,
            sortBy: parsed.sortBy,
            year: typeof parsed.year === "number" ? parsed.year : "",
            runtimeMax:
              typeof parsed.runtimeMax === "number" ? parsed.runtimeMax : "",
          })
        }
      />
    </div>
  );
}
