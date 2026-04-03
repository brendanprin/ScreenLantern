import { InteractionType } from "@prisma/client";

import { PaginationNav } from "@/components/pagination-nav";
import { TitleCard } from "@/components/title-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth";
import { searchTitles } from "@/lib/services/catalog";
import { getInteractionMap } from "@/lib/services/interactions";
import { searchParamsSchema } from "@/lib/validations/catalog";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildSearchHref(params: Record<string, string | number>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== "") {
      search.set(key, String(value));
    }
  });

  return `/app/search?${search.toString()}`;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await getCurrentUserContext();
  const parsed = searchParamsSchema.parse(await searchParams);
  const results = parsed.query
    ? await searchTitles({
        query: parsed.query,
        page: parsed.page,
        mediaType: parsed.mediaType,
      })
    : { page: 1, totalPages: 1, totalResults: 0, results: [] };

  const interactionMap = await getInteractionMap(
    user.userId,
    results.results.map((title) => ({
      tmdbId: title.tmdbId,
      mediaType: title.mediaType,
    })),
  );

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Search</p>
          <CardTitle>Search movies and series</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_120px]">
            <input
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={parsed.query}
              name="query"
              placeholder="Search for a title, cast member, or mood"
            />
            <select
              className="h-11 rounded-2xl border border-input bg-background/80 px-4 py-2"
              defaultValue={parsed.mediaType}
              name="mediaType"
            >
              <option value="all">Movies + Series</option>
              <option value="movie">Movies</option>
              <option value="tv">Series</option>
            </select>
            <button className="rounded-full bg-primary px-4 py-2 text-primary-foreground">
              Search
            </button>
          </form>
        </CardContent>
      </Card>

      {parsed.query ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {results.totalResults} result{results.totalResults === 1 ? "" : "s"} for &quot;{parsed.query}&quot;
          </p>
          {results.notice ? (
            <Card className="border-amber-200 bg-amber-50/80">
              <CardContent className="p-4 text-sm text-amber-900">
                {results.notice}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Start with a title, genre, franchise, or cast member and ScreenLantern will search across movies and series.
          </CardContent>
        </Card>
      )}

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

      {parsed.query && results.results.length === 0 && !results.notice ? (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No matching titles turned up. Try a broader query or switch between movies and series.
          </CardContent>
        </Card>
      ) : null}

      <PaginationNav
        page={results.page}
        totalPages={results.totalPages}
        buildHref={(page) =>
          buildSearchHref({
            query: parsed.query,
            mediaType: parsed.mediaType,
            page,
          })
        }
      />
    </div>
  );
}
