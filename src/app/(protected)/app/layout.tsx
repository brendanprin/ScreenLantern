import { AppShell } from "@/components/app-shell";
import { getCurrentUserContext } from "@/lib/auth";
import { getRecommendationContextBootstrap } from "@/lib/services/recommendation-context";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUserContext();
  const recommendationContext = await getRecommendationContextBootstrap({
    userId: user.userId,
    householdId: user.householdId,
  });

  return (
    <AppShell
      currentUser={{
        id: user.userId,
        name: user.name,
        householdId: user.householdId,
        householdName: user.householdName,
        householdRole: user.householdRole,
      }}
      householdMembers={recommendationContext.householdMembers}
      savedGroups={recommendationContext.savedGroups}
      initialContext={recommendationContext.context}
    >
      {children}
    </AppShell>
  );
}
