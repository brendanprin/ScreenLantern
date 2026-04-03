"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateInviteFormProps {
  inviteBaseUrl: string;
}

const EXPIRY_OPTIONS = [
  { label: "24 hours", value: 1 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
];

export function CreateInviteForm({ inviteBaseUrl }: CreateInviteFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  const inviteLink = useMemo(() => {
    if (!createdCode) {
      return "";
    }

    return `${inviteBaseUrl}/sign-up?invite=${createdCode}`;
  }, [createdCode, inviteBaseUrl]);

  async function handleCreateInvite() {
    startTransition(async () => {
      setFormError(null);

      const response = await fetch("/api/household/invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresInDays }),
      });

      const payload = (await response.json()) as {
        error?: string;
        invite?: { code: string };
      };

      if (!response.ok || !payload.invite) {
        setFormError(payload.error ?? "Unable to create an invite.");
        return;
      }

      setCreatedCode(payload.invite.code);
      router.refresh();
    });
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  return (
    <Card className="bg-white/80">
      <CardHeader>
        <CardTitle>Create an invite</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="invite-expiration">Expiration</Label>
          <select
            id="invite-expiration"
            className="h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm"
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(Number(event.target.value))}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <Button disabled={isPending} onClick={handleCreateInvite} type="button">
          {isPending ? "Creating invite..." : "Create invite"}
        </Button>

        {createdCode ? (
          <div className="space-y-3 rounded-[24px] border border-border bg-background/60 p-4">
            <div>
              <p className="text-sm font-medium">Latest invite code</p>
              <p className="text-xs text-muted-foreground">
                Single-use invite for a new household member.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-code">Invite code</Label>
              <div className="flex gap-2">
                <Input id="invite-code" readOnly value={createdCode} />
                <Button type="button" variant="outline" onClick={() => copyText(createdCode)}>
                  Copy
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-link">Invite link</Label>
              <div className="flex gap-2">
                <Input id="invite-link" readOnly value={inviteLink} />
                <Button type="button" variant="outline" onClick={() => copyText(inviteLink)}>
                  Copy
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

