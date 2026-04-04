"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useActiveContext } from "@/components/active-context-provider";
import { cn } from "@/lib/utils";

const REMINDER_EVENT = "screenlantern-reminders-changed";

interface ReminderSummaryResponse {
  unreadCount: number;
}

export function ReminderNavLink() {
  const pathname = usePathname();
  const { activeMode, activeSavedGroupId, selectedUserIds } = useActiveContext();
  const deferredUserIds = useDeferredValue(selectedUserIds);
  const userIdsParam = deferredUserIds.join(",");
  const [unreadCount, setUnreadCount] = useState(0);
  const safePathname = pathname ?? "";
  const isActive =
    safePathname === "/app/reminders" ||
    safePathname.startsWith("/app/reminders/");

  useEffect(() => {
    const controller = new AbortController();

    async function loadReminderSummary() {
      const params = new URLSearchParams({
        userIds: userIdsParam,
        mode: activeMode,
        refresh: "1",
        summary: "1",
      });

      if (activeSavedGroupId) {
        params.set("savedGroupId", activeSavedGroupId);
      }

      try {
        const response = await fetch(`/api/reminders?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load reminder summary.");
        }

        const payload = (await response.json()) as ReminderSummaryResponse;

        if (!controller.signal.aborted) {
          setUnreadCount(payload.unreadCount ?? 0);
        }
      } catch {
        if (!controller.signal.aborted) {
          setUnreadCount(0);
        }
      }
    }

    void loadReminderSummary();

    const handleRefresh = () => {
      void loadReminderSummary();
    };

    window.addEventListener(REMINDER_EVENT, handleRefresh);

    return () => {
      controller.abort();
      window.removeEventListener(REMINDER_EVENT, handleRefresh);
    };
  }, [activeMode, activeSavedGroupId, userIdsParam]);

  return (
    <Link
      href="/app/reminders"
      className={cn(
        "flex items-center justify-between rounded-full px-4 py-2 text-sm transition",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-2">
        <Bell className="h-4 w-4" />
        Reminders
      </span>
      {unreadCount > 0 ? (
        <Badge
          variant={isActive ? "secondary" : "default"}
          className="min-w-7 justify-center rounded-full px-2"
        >
          {unreadCount}
        </Badge>
      ) : null}
    </Link>
  );
}

export function emitReminderChangeEvent() {
  window.dispatchEvent(new Event(REMINDER_EVENT));
}
