import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth";
import {
  getHouseholdActivityFeed,
  HOUSEHOLD_ACTIVITY_LABELS,
} from "@/lib/services/activity";
import type { HouseholdActivityItem } from "@/lib/types";

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupActivitiesByDay(items: HouseholdActivityItem[]) {
  const groups = new Map<string, HouseholdActivityItem[]>();

  items.forEach((item) => {
    const date = new Date(item.createdAt);
    const key = date.toLocaleDateString([], {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const existing = groups.get(key) ?? [];
    groups.set(key, [...existing, item]);
  });

  return [...groups.entries()];
}

export default async function ActivityPage() {
  const user = await getCurrentUserContext();
  const activities = await getHouseholdActivityFeed({
    userId: user.userId,
    householdId: user.householdId,
  });
  const groupedActivities = groupActivitiesByDay(activities);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-white via-white to-accent/60">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
            Activity
          </p>
          <CardTitle>Household history for {user.householdName}</CardTitle>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Shared saves, watched-together moments, invite changes, and major household governance events show up here. Personal-only likes, dislikes, hides, and private watchlist changes stay out of this feed.
          </p>
        </CardHeader>
      </Card>

      {activities.length === 0 ? (
        <Card className="bg-white/80">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No shared household activity yet. Shared saves, group watch events, invite changes, and governance updates will appear here as they happen.
          </CardContent>
        </Card>
      ) : (
        groupedActivities.map(([dayLabel, items]) => (
          <section key={dayLabel} className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-primary/70">
              {dayLabel}
            </p>
            <div className="grid gap-4">
              {items.map((activity) => (
                <Card
                  key={activity.id}
                  className="bg-white/80"
                  data-testid={`activity-card-${activity.id}`}
                >
                  <CardContent className="space-y-3 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{HOUSEHOLD_ACTIVITY_LABELS[activity.type]}</Badge>
                      {activity.contextLabel ? (
                        <Badge variant="outline">{activity.contextLabel}</Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(activity.createdAt)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-base font-medium text-foreground">
                        {activity.summary}
                      </p>
                      {activity.detail ? (
                        <p className="text-sm text-muted-foreground">{activity.detail}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {activity.actorName ? (
                        <span className="text-muted-foreground">
                          By <span className="font-medium text-foreground">{activity.actorName}</span>
                        </span>
                      ) : null}
                      {activity.title ? (
                        <Link
                          href={activity.title.href}
                          className="font-medium text-primary transition hover:text-primary/80"
                        >
                          Open {activity.title.title}
                        </Link>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
