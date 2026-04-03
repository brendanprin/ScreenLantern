import { getGenreOptions } from "@/lib/services/catalog";
import { discoverTitles } from "@/lib/services/catalog";
import { getCurrentUserContext } from "@/lib/auth";
import { getInteractionMap } from "@/lib/services/interactions";
import { discoverParamsSchema } from "@/lib/validations/catalog";
import { PROVIDER_OPTIONS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TitleCard } from "@/components/title-card";
import { PaginationNav } from "@/components/pagination-nav";

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

  const interactionMap = await getInteractionMap(
    user.userId,
    results.results.map((title) => ({
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
    })),
  );

  const genres = getGenreOptions();

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Browse</p>
          <CardTitle>Discover a better shortlist</CardTitle>
        </CardHeader>
        <CardContent>
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
              {PROVIDER_OPTIONS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
            <input
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={typeof parsed.year === "number" ? parsed.year : ""}
              name="year"
              placeholder="Release year"
              type="number"
            />
            <input
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={typeof parsed.runtimeMax === "number" ? parsed.runtimeMax : ""}
              name="runtimeMax"
              placeholder="Max runtime"
              type="number"
            />
            <select
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={parsed.sortBy}
              name="sortBy"
            >
              <option value="popularity.desc">Most popular</option>
              <option value="vote_average.desc">Best rated</option>
              <option value="primary_release_date.desc">Newest first</option>
            </select>
            <button className="rounded-full bg-primary px-4 py-2 text-primary-foreground xl:col-span-2">
              Update results
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-5">
        {results.results.map((title) => (
          <TitleCard
            key={`${title.mediaType}-${title.tmdbId}`}
            title={title}
            activeTypes={
              interactionMap.get(`${title.mediaType}:${title.tmdbId}`) ?? []
            }
          />
        ))}
      </div>

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

