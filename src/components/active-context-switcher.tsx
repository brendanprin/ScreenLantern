"use client";

import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveContext } from "@/components/active-context-provider";

export function ActiveContextSwitcher() {
  const {
    householdMembers,
    savedGroups,
    selectedUserIds,
    activeNames,
    activeMode,
    activeSavedGroupId,
    isGroupMode,
    setSolo,
    activateSavedGroup,
    isSaving,
    error,
  } = useActiveContext();

  return (
    <div className="flex flex-col gap-3 rounded-[26px] border border-border bg-white/70 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">
            {isGroupMode ? "Group mode" : "Solo mode"}
          </p>
          <p className="text-sm text-muted-foreground">
            Recommendations for {activeNames.join(" + ")}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Select
          onValueChange={(value) => setSolo(value)}
          value={activeMode === "SOLO" ? selectedUserIds[0] : undefined}
        >
          <SelectTrigger aria-label="Solo profile">
            <SelectValue placeholder="Switch to a solo profile" />
          </SelectTrigger>
          <SelectContent>
            {householdMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setSolo()}>
          Use my solo profile
        </Button>
        {savedGroups.length > 0 ? (
          <Select
            onValueChange={activateSavedGroup}
            value={activeSavedGroupId ?? undefined}
          >
            <SelectTrigger aria-label="Saved group">
              <SelectValue placeholder="Switch to a saved household group" />
            </SelectTrigger>
            <SelectContent>
              {savedGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {isSaving ? (
          <p className="text-xs text-muted-foreground">Syncing recommendation context...</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
