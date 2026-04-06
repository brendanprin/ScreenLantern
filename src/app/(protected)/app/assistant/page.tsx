import { AssistantPageClient } from "@/components/assistant/assistant-page-client";
import { getCurrentUserContext } from "@/lib/auth";
import { getAssistantConversationSnapshot } from "@/lib/services/assistant";

export default async function AssistantPage() {
  const user = await getCurrentUserContext();
  const snapshot = await getAssistantConversationSnapshot({
    viewer: {
      userId: user.userId,
      householdId: user.householdId,
      name: user.name,
      email: user.email,
      preferredProviders: user.preferredProviders,
    },
  });

  return <AssistantPageClient initialSnapshot={snapshot} />;
}
