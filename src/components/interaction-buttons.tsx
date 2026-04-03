"use client";

import { startTransition, useState } from "react";
import { Check, EyeOff, Heart, Plus, ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { InteractionType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import type { TitleSummary } from "@/lib/types";

interface InteractionButtonsProps {
  title: TitleSummary;
  activeTypes: InteractionType[];
}

const ACTIONS = [
  { type: InteractionType.WATCHLIST, label: "Watchlist", icon: Plus },
  { type: InteractionType.WATCHED, label: "Watched", icon: Check },
  { type: InteractionType.LIKE, label: "Like", icon: Heart },
  { type: InteractionType.DISLIKE, label: "Dislike", icon: ThumbsDown },
  { type: InteractionType.HIDE, label: "Hide", icon: EyeOff },
] as const;

export function InteractionButtons({
  title,
  activeTypes,
}: InteractionButtonsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAction(type: InteractionType) {
    setIsSubmitting(true);

    try {
      await fetch("/api/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          interactionType: type,
          active: !activeTypes.includes(type),
        }),
      });
    } finally {
      startTransition(() => {
        setIsSubmitting(false);
        router.refresh();
      });
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map(({ type, label, icon: Icon }) => {
        const isActive = activeTypes.includes(type);

        return (
          <Button
            key={type}
            type="button"
            variant={isActive ? "default" : "outline"}
            size="sm"
            disabled={isSubmitting}
            onClick={() => handleAction(type)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}

