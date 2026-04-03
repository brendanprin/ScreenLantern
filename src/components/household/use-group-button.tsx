"use client";

import { Button } from "@/components/ui/button";
import { useActiveContext } from "@/components/active-context-provider";

interface UseGroupButtonProps {
  userIds: string[];
}

export function UseGroupButton({ userIds }: UseGroupButtonProps) {
  const { setSelection } = useActiveContext();

  return (
    <Button variant="outline" size="sm" onClick={() => setSelection(userIds)}>
      Use this group
    </Button>
  );
}

