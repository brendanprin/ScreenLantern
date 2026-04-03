import Image from "next/image";

import { tmdbImageUrl } from "@/lib/utils";

interface TitlePosterProps {
  title: string;
  posterPath?: string | null;
  className?: string;
}

export function TitlePoster({
  title,
  posterPath,
  className,
}: TitlePosterProps) {
  const posterUrl = tmdbImageUrl(posterPath, "w500");

  if (!posterUrl) {
    return (
      <div
        className={`flex aspect-[2/3] items-end rounded-[24px] bg-gradient-to-br from-primary/20 via-accent to-secondary p-4 text-sm text-muted-foreground ${className ?? ""}`}
      >
        {title}
      </div>
    );
  }

  return (
    <div className={`relative aspect-[2/3] overflow-hidden rounded-[24px] ${className ?? ""}`}>
      <Image src={posterUrl} alt={title} fill className="object-cover" sizes="240px" />
    </div>
  );
}

