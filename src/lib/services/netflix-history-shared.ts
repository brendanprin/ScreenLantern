import type { MediaTypeKey } from "@/lib/types";

export interface NetflixHistoryEntryInput {
  title: string;
  watchedAt?: string | null;
}

export interface NetflixHistoryEntry {
  title: string;
  watchedAt: string | null;
}

export interface NetflixHistoryImportResult {
  imported: number;
  alreadyPresent: number;
  unmatched: number;
  scanned: number;
  recentImports: Array<{
    title: string;
    mediaType: MediaTypeKey;
    tmdbId: number;
  }>;
  unmatchedTitles: string[];
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

function parseCsvRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(field);
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  row.push(field);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

export function parseNetflixViewingHistoryCsv(input: string): NetflixHistoryEntry[] {
  const cleaned = input.replace(/^\uFEFF/, "");
  const rows = parseCsvRows(cleaned);

  return rows
    .filter((row, index) => {
      if (index !== 0) {
        return true;
      }

      const normalizedHeader = normalizeLooseText(row[0] ?? "");
      return normalizedHeader !== "title";
    })
    .map((row) => ({
      title: (row[0] ?? "").trim(),
      watchedAt: normalizeWatchedAt((row[1] ?? "").trim() || null),
    }))
    .filter((entry) => entry.title.length > 0);
}

export function summarizeNetflixHistoryImport(result: NetflixHistoryImportResult) {
  const parts = [
    `${result.imported} imported`,
    `${result.alreadyPresent} already present`,
    `${result.unmatched} unmatched`,
  ];

  return `Netflix history sync scanned ${result.scanned} unique titles: ${parts.join(", ")}.`;
}
