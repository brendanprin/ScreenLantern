import Link from "next/link";

import { ActiveContextProvider } from "@/components/active-context-provider";
import { ActiveContextSwitcher } from "@/components/active-context-switcher";
import { NavLink } from "@/components/nav-link";
import { ReminderNavLink } from "@/components/reminders/reminder-nav-link";
import { TraktAutoSyncBootstrap } from "@/components/trakt-auto-sync-bootstrap";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { APP_NAME, NAV_ITEMS } from "@/lib/constants";
import { logoutAction } from "@/lib/auth";
import type {
  HouseholdMemberOption,
  PersistedRecommendationContext,
  SavedGroupOption,
} from "@/lib/types";

interface AppShellProps {
  currentUser: {
    id: string;
    name: string;
    householdId: string;
    householdName: string;
    householdRole: "OWNER" | "MEMBER";
  };
  householdMembers: HouseholdMemberOption[];
  savedGroups: SavedGroupOption[];
  initialContext: PersistedRecommendationContext;
  children: React.ReactNode;
}

export function AppShell({
  currentUser,
  householdMembers,
  savedGroups,
  initialContext,
  children,
}: AppShellProps) {
  return (
    <ActiveContextProvider
      currentUser={{ id: currentUser.id, name: currentUser.name }}
      householdMembers={householdMembers}
      savedGroups={savedGroups}
      initialContext={initialContext}
    >
      <TraktAutoSyncBootstrap />
      <div className="container py-6">
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex h-fit flex-col gap-6 rounded-[32px] border border-border/80 bg-white/70 p-6 backdrop-blur">
            <div>
              <Link href="/app" className="font-display text-3xl text-foreground">
                {APP_NAME}
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">
                Logged in as {currentUser.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {currentUser.householdName} · {currentUser.householdRole}
              </p>
            </div>
            <nav className="flex flex-col gap-2">
              {NAV_ITEMS.slice(0, 1).map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} />
              ))}
              <ReminderNavLink />
              {NAV_ITEMS.slice(1).map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} />
              ))}
            </nav>
            <Separator />
            <ActiveContextSwitcher />
            <form action={logoutAction}>
              <Button variant="ghost" className="w-full justify-start px-0">
                Log out
              </Button>
            </form>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </ActiveContextProvider>
  );
}
