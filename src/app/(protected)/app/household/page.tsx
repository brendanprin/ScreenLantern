import {
  canManageHousehold,
  canRemoveHouseholdMember,
  canTransferHouseholdOwnership,
} from "@/lib/household-permissions";
import { env } from "@/lib/env";
import { getHouseholdInviteStatus } from "@/lib/services/household";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateGroupForm } from "@/components/household/create-group-form";
import { CreateInviteForm } from "@/components/household/create-invite-form";
import { RemoveMemberButton } from "@/components/household/remove-member-button";
import { RevokeInviteButton } from "@/components/household/revoke-invite-button";
import { TransferOwnershipButton } from "@/components/household/transfer-ownership-button";
import { UseGroupButton } from "@/components/household/use-group-button";
import { getCurrentUserContext } from "@/lib/auth";
import { getHouseholdSummary } from "@/lib/services/household";

export default async function HouseholdPage() {
  const user = await getCurrentUserContext();
  const household = await getHouseholdSummary(user.householdId);
  const canManage = canManageHousehold(user.householdRole);
  const inviteBaseUrl = env.nextAuthUrl.replace(/\/$/, "");
  const currentOwner =
    household.users.find((member) => member.householdRole === "OWNER") ?? null;
  const sortedMembers = [...household.users].sort((left, right) => {
    if (left.householdRole !== right.householdRole) {
      return left.householdRole === "OWNER" ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });

  return (
    <div className="space-y-6">
      <Card className="bg-white/80">
        <CardHeader>
          <p className="text-sm uppercase tracking-[0.24em] text-primary/70">Household</p>
          <CardTitle>{household.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm text-muted-foreground">
          <p>
            You are in this household as{" "}
            <span className="font-medium text-foreground">{user.householdRole}</span>.
          </p>
          <p>
            Current owner:{" "}
            <span className="font-medium text-foreground">
              {currentOwner ? `${currentOwner.name} (${currentOwner.email})` : "Unassigned"}
            </span>
            .
          </p>
          <p>
            {canManage
              ? "You can create and revoke invites, transfer ownership, and remove members. Removed members are moved into their own solo household in MVP."
              : "The current owner manages invites, ownership transfer, and member removal in this household."}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {sortedMembers.map((member) => (
            <div
              key={member.id}
              className="rounded-[24px] border border-border bg-background/60 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted-foreground">{member.email}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge variant={member.householdRole === "OWNER" ? "default" : "outline"}>
                    {member.householdRole}
                  </Badge>
                  {member.householdRole === "OWNER" ? (
                    <Badge variant="secondary">Current owner</Badge>
                  ) : null}
                </div>
              </div>
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
              {canManage ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {canTransferHouseholdOwnership({
                    actorRole: user.householdRole,
                    targetRole: member.householdRole,
                    isSelf: user.userId === member.id,
                  }) ? (
                    <TransferOwnershipButton
                      memberId={member.id}
                      memberName={member.name}
                    />
                  ) : null}
                  {canRemoveHouseholdMember({
                    actorRole: user.householdRole,
                    targetRole: member.householdRole,
                    isSelf: user.userId === member.id,
                  }) ? (
                    <RemoveMemberButton
                      memberId={member.id}
                      memberName={member.name}
                    />
                  ) : null}
                </div>
              ) : null}
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
                    groupId={group.id}
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

        <div className="space-y-6">
          <CreateGroupForm
            members={household.users.map((member) => ({
              id: member.id,
              name: member.name,
            }))}
          />
          {canManage ? (
            <CreateInviteForm inviteBaseUrl={inviteBaseUrl} />
          ) : (
            <Card className="bg-white/80">
              <CardHeader>
                <CardTitle>Invites</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                Only owners can create invites in MVP. Ask an owner to generate a join link or code.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle>Invite management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Invite statuses stay household-scoped across owner changes. The current owner can create and revoke invites, including invites created before a transfer.
          </p>
          {household.invites.length > 0 ? (
            household.invites.map((invite) => {
              const status = getHouseholdInviteStatus(invite);

              return (
                <div
                  key={invite.id}
                  className="rounded-[24px] border border-border bg-background/60 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{invite.code}</p>
                        <Badge
                          variant={
                            status === "ACTIVE"
                              ? "default"
                              : status === "REDEEMED"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {inviteBaseUrl}/sign-up?invite={invite.code}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created by {invite.createdBy.name} · expires{" "}
                        {new Date(invite.expiresAt).toLocaleString()}
                        {invite.redeemedBy ? ` · redeemed by ${invite.redeemedBy.name}` : ""}
                      </p>
                    </div>
                    {canManage && status === "ACTIVE" ? (
                      <RevokeInviteButton inviteId={invite.id} inviteCode={invite.code} />
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              No invites yet. Create one to let a new member join this household.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
