import Link from "next/link";
import { InteractionType } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InteractionButtons } from "@/components/interaction-buttons";
import { TitlePoster } from "@/components/title-poster";
import type { TitleSummary } from "@/lib/types";
import { formatReleaseYear, formatRuntime, mediaTypeLabel } from "@/lib/utils";

interface TitleCardProps {
  title: TitleSummary;
  activeTypes?: InteractionType[];
  highlightReason?: string;
}

export function TitleCard({
  title,
  activeTypes = [],
  highlightReason,
}: TitleCardProps) {
  return (
    <Card className="overflow-hidden bg-white/80">
      <CardContent className="p-4">
        <div className="grid gap-4 md:grid-cols-[170px_minmax(0,1fr)]">
          <Link href={`/app/title/${title.mediaType}/${title.tmdbId}`}>
            <TitlePoster title={title.title} posterPath={title.posterPath} />
          </Link>
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge variant="secondary">{mediaTypeLabel(title.mediaType)}</Badge>
                <Badge variant="outline">{formatReleaseYear(title.releaseDate)}</Badge>
                <Badge variant="outline">{formatRuntime(title.runtimeMinutes)}</Badge>
              </div>
              <Link href={`/app/title/${title.mediaType}/${title.tmdbId}`}>
                <h3 className="font-display text-2xl leading-tight">{title.title}</h3>
              </Link>
              <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                {title.overview}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {title.genres.slice(0, 4).map((genre) => (
                <Badge key={genre} variant="outline">
                  {genre}
                </Badge>
              ))}
              {title.providers.slice(0, 2).map((provider) => (
                <Badge key={provider.name}>{provider.name}</Badge>
              ))}
            </div>
            {highlightReason ? (
              <p className="text-sm font-medium text-primary">{highlightReason}</p>
            ) : null}
            <InteractionButtons title={title} activeTypes={activeTypes} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

