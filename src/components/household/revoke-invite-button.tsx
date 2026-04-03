"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface RevokeInviteButtonProps {
  inviteId: string;
  inviteCode: string;
}

export function RevokeInviteButton({
  inviteId,
  inviteCode,
}: RevokeInviteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              `Revoke invite ${inviteCode}? Anyone using this link or code after revocation will be blocked.`,
            )
          ) {
            return;
          }

          startTransition(async () => {
            setError(null);

            const response = await fetch(`/api/household/invites/${inviteId}/revoke`, {
              method: "POST",
            });
            const payload = (await response.json()) as { error?: string };

            if (!response.ok) {
              setError(payload.error ?? "Unable to revoke invite.");
              return;
            }

            router.refresh();
          });
        }}
        type="button"
      >
        {isPending ? "Revoking..." : "Revoke invite"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
