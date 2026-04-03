import Link from "next/link";
import { Search, Sparkles, Tv2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

const features = [
  {
    icon: Search,
    title: "Search everywhere faster",
    description:
      "Search movies and series, compare providers, and skip the endless app-hopping.",
  },
  {
    icon: Sparkles,
    title: "Recommendations with taste memory",
    description:
      "Likes, dislikes, watch history, and hidden titles all shape what ScreenLantern suggests next.",
  },
  {
    icon: Users,
    title: "Built for household combinations",
    description:
      "Switch between solo and group recommendation modes without muddying anyone's personal profile.",
  },
  {
    icon: Tv2,
    title: "Clear where-to-watch signals",
    description:
      "Provider availability is surfaced alongside discovery so decisions stay practical.",
  },
];

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[420px] bg-lantern-radial blur-3xl" />
      <div className="container relative flex min-h-screen flex-col justify-center py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-primary/70">
                Household streaming discovery
              </p>
              <h1 className="mt-4 max-w-3xl font-display text-5xl leading-tight text-balance md:text-7xl">
                {APP_NAME} helps you stop scrolling and start watching.
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
                Search across movies and TV, keep personal taste separate, and
                get shared recommendations that feel safe for the room.
              </p>
            </div>
            <div className="flex gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">Create account</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="border-white/60 bg-white/80">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl">{title}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {description}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

