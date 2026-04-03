import { redirect } from "next/navigation";
import type { Session } from "next-auth";

import { auth, signOut } from "../../auth";
import { prisma } from "@/lib/prisma";

async function mapSessionUser(session: Session) {
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      householdId: true,
      householdRole: true,
      preferredProviders: true,
      household: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    householdId: user.householdId,
    householdRole: user.householdRole,
    householdName: user.household.name,
    name: user.name,
    email: user.email,
    preferredProviders: user.preferredProviders,
  };
}

export async function requireSession() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  return session;
}

export async function getCurrentUserContext() {
  const session = await requireSession();
  const user = await mapSessionUser(session);

  if (!user) {
    redirect("/sign-in");
  }

  return user;
}

export async function getApiCurrentUserContext() {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return mapSessionUser(session);
}

export async function logoutAction() {
  "use server";

  await signOut({ redirectTo: "/sign-in" });
}
