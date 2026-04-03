"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface RemoveMemberButtonProps {
  memberId: string;
  memberName: string;
}

export function RemoveMemberButton({
  memberId,
  memberName,
}: RemoveMemberButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              `Remove ${memberName} from this household? They will be moved into a new solo household.`,
            )
          ) {
            return;
          }

          startTransition(async () => {
            setError(null);

            const response = await fetch(`/api/household/members/${memberId}`, {
              method: "DELETE",
            });
            const payload = (await response.json()) as { error?: string };

            if (!response.ok) {
              setError(payload.error ?? "Unable to remove member.");
              return;
            }

            router.refresh();
          });
        }}
        type="button"
      >
        {isPending ? "Removing..." : "Remove member"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
