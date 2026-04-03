"use client";

import { Button } from "@/components/ui/button";
import { useActiveContext } from "@/components/active-context-provider";

interface UseGroupButtonProps {
  groupId?: string;
  userIds: string[];
}

export function UseGroupButton({ groupId, userIds }: UseGroupButtonProps) {
  const { activateSavedGroup, setSelection } = useActiveContext();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => (groupId ? activateSavedGroup(groupId) : setSelection(userIds))}
    >
      Use this group
    </Button>
  );
}
