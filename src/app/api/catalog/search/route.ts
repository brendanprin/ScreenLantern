import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { searchTitles } from "@/lib/services/catalog";
import type { MediaTypeKey } from "@/lib/types";

export async function GET(request: Request) {
  await getCurrentUserContext();

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const mediaType = (searchParams.get("mediaType") ?? "all") as MediaTypeKey | "all";

  if (!query) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const results = await searchTitles({ query, mediaType });

  return NextResponse.json({
    ok: true,
    results: results.results.slice(0, 6).map((r) => ({
      tmdbId: r.tmdbId,
      mediaType: r.mediaType,
      title: r.title,
      releaseYear: r.releaseDate ? new Date(r.releaseDate).getFullYear() : null,
      posterPath: r.posterPath ?? null,
    })),
  });
}
