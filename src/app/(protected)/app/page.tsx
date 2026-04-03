import { Lightbulb, Users } from "lucide-react";

import { RecommendationFeed } from "@/components/home/recommendation-feed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth";

export default async function AppHomePage() {
  const user = await getCurrentUserContext();

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-white via-white to-accent/60">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">
            Tonight starts here
          </p>
          <CardTitle className="max-w-3xl text-4xl">
            ScreenLantern keeps your solo taste and household overlap in view at the same time.
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-border bg-background/60 p-5">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Lightbulb className="h-5 w-5" />
            </div>
            <p className="font-medium">Viewing as {user.name}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your likes, dislikes, hidden titles, watched history, and provider preferences guide the default feed.
            </p>
          </div>
          <div className="rounded-[24px] border border-border bg-background/60 p-5">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <p className="font-medium">Switch to a group at any time</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Saved household groups and custom combinations are treated as recommendation contexts, not identity changes.
            </p>
          </div>
        </CardContent>
      </Card>

      <RecommendationFeed />
    </div>
  );
}

