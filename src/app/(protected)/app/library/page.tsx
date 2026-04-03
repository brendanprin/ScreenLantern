import Link from "next/link";
import { InteractionType } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TitleCard } from "@/components/title-card";
import { getCurrentUserContext } from "@/lib/auth";
import { INTERACTION_LABELS } from "@/lib/constants";
import { getInteractionMap, getLibraryItems } from "@/lib/services/interactions";
import { cn } from "@/lib/utils";

const TABS = [
  InteractionType.WATCHLIST,
  InteractionType.WATCHED,
  InteractionType.LIKE,
  InteractionType.DISLIKE,
  InteractionType.HIDE,
] as const;

interface LibraryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const user = await getCurrentUserContext();
  const params = await searchParams;
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab = TABS.includes(requestedTab as InteractionType)
    ? (requestedTab as InteractionType)
    : InteractionType.WATCHLIST;

  const items = await getLibraryItems(user.userId, activeTab);
  const interactionMap = await getInteractionMap(
    user.userId,
    items.map((item: (typeof items)[number]) => ({
      tmdbId: item.title.tmdbId,
      mediaType: item.title.mediaType,
    })),
  );

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Library</p>
          <CardTitle>{user.name}&rsquo;s personal library</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab}
              href={`/app/library?tab=${tab}`}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {INTERACTION_LABELS[tab]}
            </Link>
          ))}
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card className="bg-white/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nothing here yet. Search or browse for titles and start building your ScreenLantern library.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5">
        {items.map((item: (typeof items)[number]) => (
          <TitleCard
            key={`${item.title.mediaType}-${item.title.tmdbId}`}
            title={item.title}
            activeTypes={
              interactionMap.get(`${item.title.mediaType}:${item.title.tmdbId}`) ?? []
            }
          />
        ))}
      </div>
    </div>
  );
}
