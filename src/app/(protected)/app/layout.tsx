import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();

  const household = await prisma.household.findUniqueOrThrow({
    where: { id: session.user.householdId },
    include: {
      users: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
      groups: {
        orderBy: { name: "asc" },
        include: {
          members: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });

  return (
    <AppShell
      currentUser={{
        id: session.user.id,
        name: session.user.name ?? "Member",
        householdId: household.id,
      }}
      householdMembers={household.users}
      savedGroups={household.groups.map((group) => ({
        id: group.id,
        name: group.name,
        userIds: group.members.map((member) => member.userId),
      }))}
    >
      {children}
    </AppShell>
  );
}

