import { redirect } from "next/navigation";

import { auth, signOut } from "../../auth";

export async function requireSession() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  return session;
}

export async function getCurrentUserContext() {
  const session = await requireSession();

  return {
    userId: session.user.id,
    householdId: session.user.householdId,
    name: session.user.name ?? "Member",
    email: session.user.email ?? "",
    preferredProviders: session.user.preferredProviders ?? [],
  };
}

export async function logoutAction() {
  "use server";

  await signOut({ redirectTo: "/sign-in" });
}

