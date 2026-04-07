"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface UnresolvedItem {
  id: string;
  rawTitle: string;
  createdAt: string;
  librarySuggestions: SearchResult[];
}

interface SearchResult {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  releaseYear: number | null;
  posterPath: string | null;
}

interface ItemState {
  searchQuery: string;
  results: SearchResult[];
  isSearching: boolean;
  isPending: boolean;
  done: boolean;
  error: string | null;
  tmdbIdQuery: string;
  tmdbIdMediaType: "movie" | "tv";
  tmdbIdPreview: SearchResult | null;
  isTmdbIdLooking: boolean;
  showTmdbLookup: boolean;
}

export interface NetflixUnresolvedListProps {
  initialItems: UnresolvedItem[];
}

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w92";

const SEASON_SEGMENT_RE = /^(?:season|episode|part|volume|chapter|series)\s*\d/i;

function extractShowName(title: string): string | null {
  const parts = title.split(":").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  for (let i = 1; i < parts.length; i++) {
    if (SEASON_SEGMENT_RE.test(parts[i]!)) return parts.slice(0, i).join(": ");
  }
  if (parts.length >= 3) return parts[0]!;
  return null;
}

function mediaTypeLabel(mediaType: "movie" | "tv") {
  return mediaType === "movie" ? "Movie" : "TV";
}

export function NetflixUnresolvedList({ initialItems }: NetflixUnresolvedListProps) {
  const [items] = useState<UnresolvedItem[]>(initialItems);
  const [states, setStates] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      initialItems.map((item) => {
        const strippedTitle = item.rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim();
        const showName = extractShowName(strippedTitle);
        return [
          item.id,
          {
            searchQuery: showName ?? strippedTitle,
            results: [],
            isSearching: false,
            isPending: false,
            done: false,
            error: null,
            tmdbIdQuery: "",
            tmdbIdMediaType: showName ? "tv" : "movie",
            tmdbIdPreview: null,
            isTmdbIdLooking: false,
            showTmdbLookup: false,
          },
        ];
      }),
    ),
  );
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const updateState = useCallback((id: string, patch: Partial<ItemState>) => {
    setStates((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, ...patch },
    }));
  }, []);

  async function search(id: string, query: string) {
    if (!query.trim()) {
      updateState(id, { results: [], isSearching: false });
      return;
    }

    updateState(id, { isSearching: true });

    try {
      const response = await fetch(
        `/api/catalog/search?q=${encodeURIComponent(query)}&mediaType=all`,
      );
      const payload = (await response.json()) as { ok: boolean; results: SearchResult[] };
      updateState(id, { results: payload.ok ? payload.results : [], isSearching: false });
    } catch {
      updateState(id, { results: [], isSearching: false });
    }
  }

  function handleQueryChange(id: string, value: string) {
    updateState(id, { searchQuery: value, error: null });

    if (searchTimers.current[id]) {
      clearTimeout(searchTimers.current[id]);
    }

    searchTimers.current[id] = setTimeout(() => {
      search(id, value).catch(() => undefined);
    }, 350);
  }

  async function resolve(id: string, result: SearchResult) {
    updateState(id, { isPending: true, error: null });

    try {
      const response = await fetch(`/api/integrations/netflix/unresolved/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          tmdbId: result.tmdbId,
          mediaType: result.mediaType,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not resolve this title.");
      }

      updateState(id, { done: true, isPending: false });
    } catch (error) {
      updateState(id, {
        isPending: false,
        error: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  }

  async function dismiss(id: string) {
    updateState(id, { isPending: true, error: null });

    try {
      const response = await fetch(`/api/integrations/netflix/unresolved/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Could not dismiss this title.");
      }

      updateState(id, { done: true, isPending: false });
    } catch (error) {
      updateState(id, {
        isPending: false,
        error: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  }

  async function lookupByTmdbId(id: string) {
    const state = states[id];
    if (!state) return;
    const tmdbId = Number(state.tmdbIdQuery.trim());
    if (!tmdbId) {
      updateState(id, { error: "Enter a valid TMDb ID." });
      return;
    }

    updateState(id, { isTmdbIdLooking: true, tmdbIdPreview: null, error: null });

    try {
      const response = await fetch(
        `/api/catalog/title?tmdbId=${tmdbId}&mediaType=${state.tmdbIdMediaType}`,
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        title?: SearchResult;
      };

      if (!response.ok || !payload.title) {
        throw new Error(payload.error ?? "Title not found.");
      }

      updateState(id, { tmdbIdPreview: payload.title, isTmdbIdLooking: false });
    } catch (error) {
      updateState(id, {
        isTmdbIdLooking: false,
        error: error instanceof Error ? error.message : "Lookup failed.",
      });
    }
  }

  const visibleItems = items.filter((item) => !states[item.id]?.done);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <Card className="bg-white/80">
      <CardHeader>
        <CardTitle>Unresolved Netflix titles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These {items.length} Netflix titles could not be automatically matched to a catalog
          entry. Find the right match and mark as watched, or dismiss titles you do not want
          imported. Resolved and dismissed titles will not resurface on future syncs.
        </p>

        <ul className="space-y-3">
          {visibleItems.map((item) => {
            const state = states[item.id]!;

            return (
              <li
                key={item.id}
                className="rounded-2xl border border-border/70 bg-background/50 p-4 text-sm space-y-3"
              >
                <p className="font-medium text-foreground">{item.rawTitle}</p>
                {extractShowName(item.rawTitle.replace(/\s*\(\d{4}\)\s*$/, "").trim()) ? (
                  <p className="text-xs text-muted-foreground">
                    Searching as TV show — adjust below if needed
                  </p>
                ) : null}

                <div className="flex gap-2">
                  <Input
                    value={state.searchQuery}
                    onChange={(e) => handleQueryChange(item.id, e.target.value)}
                    placeholder="Search TMDb…"
                    className="h-8 text-sm"
                    disabled={state.isPending}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={state.isPending || state.isSearching}
                    onClick={() => search(item.id, state.searchQuery)}
                  >
                    {state.isSearching ? "Searching…" : "Search"}
                  </Button>
                </div>

                {item.librarySuggestions.length > 0 && !state.done ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-primary">Already in your library</p>
                    <ul className="space-y-2">
                      {item.librarySuggestions.map((result) => (
                        <li
                          key={`library-${result.mediaType}-${result.tmdbId}`}
                          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-2"
                        >
                          {result.posterPath ? (
                            <Image
                              src={`${TMDB_IMAGE_BASE}${result.posterPath}`}
                              alt=""
                              width={32}
                              height={48}
                              className="shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="h-12 w-8 shrink-0 rounded bg-muted" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">{result.title}</p>
                            <p className="text-muted-foreground">
                              {mediaTypeLabel(result.mediaType)}
                              {result.releaseYear ? ` · ${result.releaseYear}` : ""}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={state.isPending}
                            onClick={() => resolve(item.id, result)}
                          >
                            Match
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {state.results.length > 0 ? (
                  <ul className="space-y-2">
                    {state.results.map((result) => (
                      <li
                        key={`${result.mediaType}-${result.tmdbId}`}
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/70 p-2"
                      >
                        {result.posterPath ? (
                          <Image
                            src={`${TMDB_IMAGE_BASE}${result.posterPath}`}
                            alt=""
                            width={32}
                            height={48}
                            className="shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="h-12 w-8 shrink-0 rounded bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{result.title}</p>
                          <p className="text-muted-foreground">
                            {mediaTypeLabel(result.mediaType)}
                            {result.releaseYear ? ` · ${result.releaseYear}` : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={state.isPending}
                          onClick={() => resolve(item.id, result)}
                        >
                          Match
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => updateState(item.id, { showTmdbLookup: !state.showTmdbLookup })}
                  >
                    {state.showTmdbLookup ? "▾" : "▸"} Look up by TMDb ID
                  </button>
                  {state.showTmdbLookup ? <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Find the title on{" "}
                      <a
                        href="https://www.themoviedb.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        themoviedb.org
                      </a>
                      , copy the ID from the URL, and paste it here.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={state.tmdbIdQuery}
                        onChange={(e) =>
                          updateState(item.id, { tmdbIdQuery: e.target.value, tmdbIdPreview: null })
                        }
                        placeholder="TMDb ID"
                        className="h-8 w-28 text-sm"
                        disabled={state.isPending}
                      />
                      <select
                        value={state.tmdbIdMediaType}
                        onChange={(e) =>
                          updateState(item.id, {
                            tmdbIdMediaType: e.target.value as "movie" | "tv",
                            tmdbIdPreview: null,
                          })
                        }
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        disabled={state.isPending}
                      >
                        <option value="movie">Movie</option>
                        <option value="tv">TV</option>
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={state.isPending || state.isTmdbIdLooking || !state.tmdbIdQuery.trim()}
                        onClick={() => lookupByTmdbId(item.id)}
                      >
                        {state.isTmdbIdLooking ? "Looking up…" : "Look up"}
                      </Button>
                    </div>

                    {state.tmdbIdPreview ? (
                      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/70 p-2">
                        {state.tmdbIdPreview.posterPath ? (
                          <Image
                            src={`${TMDB_IMAGE_BASE}${state.tmdbIdPreview.posterPath}`}
                            alt=""
                            width={32}
                            height={48}
                            className="shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="h-12 w-8 shrink-0 rounded bg-muted" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {state.tmdbIdPreview.title}
                          </p>
                          <p className="text-muted-foreground">
                            {mediaTypeLabel(state.tmdbIdPreview.mediaType)}
                            {state.tmdbIdPreview.releaseYear
                              ? ` · ${state.tmdbIdPreview.releaseYear}`
                              : ""}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={state.isPending}
                          onClick={() => resolve(item.id, state.tmdbIdPreview!)}
                        >
                          Match
                        </Button>
                      </div>
                    ) : null}
                  </div> : null}
                </div>

                {state.error ? (
                  <p className="text-sm text-destructive">{state.error}</p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={state.isPending}
                    onClick={() => dismiss(item.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
