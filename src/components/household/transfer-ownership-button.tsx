"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

interface TransferOwnershipButtonProps {
  memberId: string;
  memberName: string;
}

export function TransferOwnershipButton({
  memberId,
  memberName,
}: TransferOwnershipButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => {
          if (
            !window.confirm(
              `Transfer household ownership to ${memberName}? You will become a member and ${memberName} will become the owner.`,
            )
          ) {
            return;
          }

          startTransition(async () => {
            setError(null);

            const response = await fetch("/api/household/owner/transfer", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ memberId }),
            });
            const payload = (await response.json()) as { error?: string };

            if (!response.ok) {
              setError(payload.error ?? "Unable to transfer ownership.");
              return;
            }

            router.refresh();
          });
        }}
        type="button"
      >
        {isPending ? "Transferring..." : "Transfer ownership"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
