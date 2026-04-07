import { ImportSource, InteractionType, SourceContext } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { searchTitles } from "@/lib/services/catalog";
import type {
  NetflixHistoryEntry,
  NetflixHistoryEntryInput,
  NetflixHistoryImportResult,
} from "@/lib/services/netflix-history-shared";
import {
  parseNetflixViewingHistoryCsv,
  summarizeNetflixHistoryImport,
} from "@/lib/services/netflix-history-shared";
import { toTmdbKey, upsertTitleCache } from "@/lib/services/title-cache";
import type { MediaTypeKey, TitleSummary } from "@/lib/types";

interface NetflixTitleCandidate {
  query: string;
  mediaTypeHint: MediaTypeKey | null;
}

function normalizeLooseText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeWatchedAt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

// Matches a colon-delimited segment that is a season/episode/part indicator,
// e.g. "Season 2", "Episode 5", "Part 1", "Volume 3", "Chapter 4", "Series 1"
const SEASON_SEGMENT_RE = /^(?:season|episode|part|volume|chapter|series)\s*\d/i;

/**
 * For an episode title like "Star Wars: The Bad Batch: Season 2: Episode 1",
 * returns "Star Wars: The Bad Batch" — everything before the first season/episode
 * indicator segment. Falls back to the first colon segment for 3+ part titles
 * that have no explicit indicator.
 */
export function extractShowNameFromEpisodeTitle(title: string): string | null {
  const parts = title.split(":").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  for (let i = 1; i < parts.length; i++) {
    if (SEASON_SEGMENT_RE.test(parts[i]!)) {
      return parts.slice(0, i).join(": ");
    }
  }

  // No explicit indicator — if there are 3+ segments it is still likely an episode
  if (parts.length >= 3) {
    return parts[0]!;
  }

  return null;
}

function buildNetflixTitleCandidates(title: string): NetflixTitleCandidate[] {
  const trimmed = title.trim();
  if (!trimmed) {
    return [];
  }

  const candidates: NetflixTitleCandidate[] = [
    { query: trimmed, mediaTypeHint: null },
  ];

  const showName = extractShowNameFromEpisodeTitle(trimmed);
  if (showName && showName !== trimmed) {
    // Prefer the full extracted show name (may contain colons, e.g. "Show A: Subtitle")
    candidates.push({ query: showName, mediaTypeHint: "tv" });

    // Also try just the first segment as a fallback in case the show name itself
    // is a subtitle and the real series name is only the first part
    const firstSegment = trimmed.split(":")[0]!.trim();
    if (firstSegment !== showName) {
      candidates.push({ query: firstSegment, mediaTypeHint: "tv" });
    }
  } else if (trimmed.includes(":")) {
    const prefix = trimmed.split(":")[0]?.trim();
    if (prefix && prefix !== trimmed) {
      candidates.push({ query: prefix, mediaTypeHint: null });
    }
  }

  return candidates.filter(
    (candidate, index, items) =>
      candidate.query.length > 0 &&
      items.findIndex(
        (entry) =>
          entry.query === candidate.query && entry.mediaTypeHint === candidate.mediaTypeHint,
      ) === index,
  );
}

function scoreNetflixMatch(args: {
  candidate: TitleSummary;
  originalTitle: string;
  query: string;
  mediaTypeHint: MediaTypeKey | null;
}) {
  const candidateName = normalizeLooseText(args.candidate.title);
  const originalName = normalizeLooseText(args.originalTitle);
  const queryName = normalizeLooseText(args.query);
  let score = 0;

  if (candidateName === originalName) {
    score += 120;
  }

  if (candidateName === queryName) {
    score += 110;
  }

  if (originalName.startsWith(candidateName) || candidateName.startsWith(queryName)) {
    score += 70;
  }

  if (queryName.startsWith(candidateName)) {
    score += 60;
  }

  if (args.mediaTypeHint && args.candidate.mediaType === args.mediaTypeHint) {
    score += 20;
  }

  if (typeof args.candidate.popularity === "number") {
    score += Math.min(args.candidate.popularity / 100, 5);
  }

  return score;
}

async function findBestNetflixMatch(
  title: string,
  queryCache: Map<string, TitleSummary[]>,
) {
  const candidates = buildNetflixTitleCandidates(title);
  let best: { title: TitleSummary; score: number } | null = null;

  for (const candidate of candidates) {
    const cacheKey = `${candidate.mediaTypeHint ?? "all"}:${candidate.query}`;

    if (!queryCache.has(cacheKey)) {
      const results = await searchTitles({
        query: candidate.query,
        mediaType: candidate.mediaTypeHint ?? "all",
      });
      queryCache.set(cacheKey, results.results.slice(0, 5));
    }

    const results = queryCache.get(cacheKey) ?? [];
    for (const result of results) {
      const score = scoreNetflixMatch({
        candidate: result,
        originalTitle: title,
        query: candidate.query,
        mediaTypeHint: candidate.mediaTypeHint,
      });

      if (!best || score > best.score) {
        best = {
          title: result,
          score,
        };
      }
    }
  }

  return best && best.score >= 70 ? best.title : null;
}

function dedupeNetflixEntries(entries: NetflixHistoryEntryInput[]) {
  const byKey = new Map<string, NetflixHistoryEntry>();

  for (const entry of entries) {
    const title = entry.title.trim();
    if (!title) {
      continue;
    }

    const importKey =
      buildNetflixTitleCandidates(title)[1]?.query ??
      buildNetflixTitleCandidates(title)[0]?.query ??
      title;
    const key = normalizeLooseText(importKey);
    const watchedAt = normalizeWatchedAt(entry.watchedAt);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        title,
        watchedAt,
      });
      continue;
    }

    const existingTime = existing.watchedAt ? Date.parse(existing.watchedAt) : 0;
    const nextTime = watchedAt ? Date.parse(watchedAt) : 0;

    if (nextTime > existingTime) {
      byKey.set(key, {
        title,
        watchedAt,
      });
    }
  }

  return [...byKey.values()].sort((left, right) => {
    const leftTime = left.watchedAt ? Date.parse(left.watchedAt) : 0;
    const rightTime = right.watchedAt ? Date.parse(right.watchedAt) : 0;
    return rightTime - leftTime;
  });
}

export async function importNetflixViewingHistory(args: {
  userId: string;
  entries: NetflixHistoryEntryInput[];
}): Promise<NetflixHistoryImportResult> {
  const uniqueEntries = dedupeNetflixEntries(args.entries);
  const queryCache = new Map<string, TitleSummary[]>();
  const unmatchedTitles: string[] = [];
  const recentImports: NetflixHistoryImportResult["recentImports"] = [];
  let imported = 0;
  let alreadyPresent = 0;

  for (const entry of uniqueEntries) {
    const matchedTitle = await findBestNetflixMatch(entry.title, queryCache);

    if (!matchedTitle) {
      unmatchedTitles.push(entry.title);
      continue;
    }

    const cachedTitle = await upsertTitleCache(matchedTitle);
    const existing = await prisma.userTitleInteraction.findUnique({
      where: {
        userId_titleCacheId_interactionType: {
          userId: args.userId,
          titleCacheId: cachedTitle.id,
          interactionType: InteractionType.WATCHED,
        },
      },
    });

    if (existing) {
      alreadyPresent += 1;
      continue;
    }

    await prisma.userTitleInteraction.create({
      data: {
        userId: args.userId,
        titleCacheId: cachedTitle.id,
        interactionType: InteractionType.WATCHED,
        sourceContext: SourceContext.NETFLIX_IMPORTED,
      },
    });

    imported += 1;
    recentImports.push({
      title: matchedTitle.title,
      mediaType: matchedTitle.mediaType,
      tmdbId: matchedTitle.tmdbId,
    });
  }

  if (unmatchedTitles.length > 0) {
    await prisma.unresolvedImport.createMany({
      data: unmatchedTitles.map((rawTitle) => ({
        userId: args.userId,
        source: ImportSource.NETFLIX,
        rawTitle,
      })),
      skipDuplicates: true,
    });
  }

  return {
    imported,
    alreadyPresent,
    unmatched: unmatchedTitles.length,
    scanned: uniqueEntries.length,
    recentImports: recentImports.slice(0, 5),
    unmatchedTitles: unmatchedTitles.slice(0, 10),
  };
}

export { parseNetflixViewingHistoryCsv, summarizeNetflixHistoryImport };
