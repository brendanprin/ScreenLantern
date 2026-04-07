import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { getTitleDetails } from "@/lib/services/catalog";
import type { MediaTypeKey } from "@/lib/types";

export async function GET(request: Request) {
  await getCurrentUserContext();

  const { searchParams } = new URL(request.url);
  const tmdbId = Number(searchParams.get("tmdbId"));
  const mediaType = searchParams.get("mediaType") as MediaTypeKey | null;

  if (!tmdbId || !mediaType || (mediaType !== "movie" && mediaType !== "tv")) {
    return NextResponse.json({ error: "tmdbId and mediaType (movie|tv) are required." }, { status: 400 });
  }

  const result = await getTitleDetails(tmdbId, mediaType);

  if (!result.data) {
    return NextResponse.json({ error: "Title not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    title: {
      tmdbId: result.data.tmdbId,
      mediaType: result.data.mediaType,
      title: result.data.title,
      releaseYear: result.data.releaseDate ? new Date(result.data.releaseDate).getFullYear() : null,
      posterPath: result.data.posterPath ?? null,
    },
  });
}
