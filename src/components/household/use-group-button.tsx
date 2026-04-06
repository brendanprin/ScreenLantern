"use client";

import { Button } from "@/components/ui/button";
import { useActiveContext } from "@/components/active-context-provider";

interface UseGroupButtonProps {
  groupId?: string;
  groupName?: string;
  userIds: string[];
}

export function UseGroupButton({
  groupId,
  groupName,
  userIds,
}: UseGroupButtonProps) {
  const { activateSavedGroup, setSelection } = useActiveContext();

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={groupName ? `Use group ${groupName}` : "Use this group"}
      onClick={() => (groupId ? activateSavedGroup(groupId) : setSelection(userIds))}
    >
      Use this group
    </Button>
  );
}
