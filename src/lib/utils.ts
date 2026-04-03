import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function tmdbImageUrl(
  path: string | null | undefined,
  size: "w342" | "w500" | "w780" | "original" = "w500",
) {
  if (!path) {
    return null;
  }

  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function formatRuntime(runtimeMinutes?: number | null) {
  if (!runtimeMinutes) {
    return "Runtime unavailable";
  }

  const hours = Math.floor(runtimeMinutes / 60);
  const minutes = runtimeMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

export function formatReleaseYear(releaseDate?: string | null) {
  if (!releaseDate) {
    return "TBD";
  }

  return new Date(releaseDate).getUTCFullYear().toString();
}

export function mediaTypeLabel(mediaType: "movie" | "tv") {
  return mediaType === "movie" ? "Movie" : "Series";
}

export function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = getKey(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function scoreToPercent(score: number, floor = 0, ceiling = 100) {
  return Math.max(floor, Math.min(ceiling, Math.round(score)));
}

