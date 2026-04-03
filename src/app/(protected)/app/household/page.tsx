import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateGroupForm } from "@/components/household/create-group-form";
import { UseGroupButton } from "@/components/household/use-group-button";
import { getCurrentUserContext } from "@/lib/auth";
import { getHouseholdSummary } from "@/lib/services/household";

export default async function HouseholdPage() {
  const user = await getCurrentUserContext();
  const household = await getHouseholdSummary(user.householdId);

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Household</p>
          <CardTitle>{household.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {household.users.map((member) => (
            <div
              key={member.id}
              className="rounded-[24px] border border-border bg-background/60 p-5"
            >
              <p className="font-medium">{member.name}</p>
              <p className="text-sm text-muted-foreground">{member.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {member.preferredProviders.length > 0 ? (
                  member.preferredProviders.map((provider) => (
                    <span
                      key={provider}
                      className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                    >
                      {provider}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No provider preferences yet
                  </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="bg-white/80">
          <CardHeader>
            <CardTitle>Saved recommendation groups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {household.groups.length > 0 ? (
              household.groups.map((group) => (
                <div
                  key={group.id}
                  className="flex flex-col gap-4 rounded-[24px] border border-border bg-background/60 p-5"
                >
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {group.members.map((member) => member.user.name).join(" + ")}
                    </p>
                  </div>
                  <UseGroupButton
                    userIds={group.members.map((member) => member.user.id)}
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No saved groups yet. Create one for common pairings like Brendan + Katie or movie-night trios.
              </p>
            )}
          </CardContent>
        </Card>

        <CreateGroupForm
          members={household.users.map((member) => ({
            id: member.id,
            name: member.name,
          }))}
        />
      </div>
    </div>
  );
}

