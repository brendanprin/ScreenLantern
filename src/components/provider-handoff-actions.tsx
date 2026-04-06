import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TitleHandoffSummary } from "@/lib/types";

interface ProviderHandoffActionsProps {
  handoff: TitleHandoffSummary;
  variant?: "detail" | "card";
}

export function ProviderHandoffActions({
  handoff,
  variant = "card",
}: ProviderHandoffActionsProps) {
  if (handoff.status !== "openable") {
    if (variant === "detail" && handoff.fallbackMessage) {
      return <p className="text-sm text-muted-foreground">{handoff.fallbackMessage}</p>;
    }

    return null;
  }

  const primary = handoff.primaryOption;

  if (!primary?.handoffUrl) {
    return null;
  }

  const isDetail = variant === "detail";
  const buttonSize = isDetail ? "default" : "sm";

  return (
    <div
      className={
        isDetail
          ? "space-y-3 rounded-2xl border border-border/70 bg-background/60 p-4"
          : "space-y-2"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size={buttonSize}>
          <Link
            href={primary.handoffUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            Open in {primary.providerName}
          </Link>
        </Button>
        {handoff.selectedAvailability === "selected_services" ? (
          <Badge variant="secondary">Available on your services</Badge>
        ) : null}
      </div>

      {isDetail ? (
        <p className="text-sm text-muted-foreground">
          This opens search results in {primary.providerName} for this title.
        </p>
      ) : null}

      {handoff.openableOptions.length > 1 ? (
        <details className="rounded-xl border border-border/70 bg-white/70 p-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-primary transition hover:text-primary/80">
            Choose service
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {handoff.openableOptions.map((option) => (
              <Button key={option.providerName} asChild size="sm" variant="outline">
                <Link
                  href={option.handoffUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  {option.providerName}
                </Link>
              </Button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
