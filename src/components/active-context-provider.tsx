"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type {
  HouseholdMemberOption,
  PersistedRecommendationContext,
  RecommendationModeKey,
  SavedGroupOption,
} from "@/lib/types";

interface ActiveContextValue {
  householdMembers: HouseholdMemberOption[];
  savedGroups: SavedGroupOption[];
  selectedUserIds: string[];
  activeNames: string[];
  activeMode: RecommendationModeKey;
  activeSavedGroupId: string | null;
  isGroupMode: boolean;
  isSaving: boolean;
  error: string | null;
  setSolo: (userId?: string) => void;
  setSelection: (userIds: string[]) => void;
  activateSavedGroup: (groupId: string) => void;
}

const ActiveContext = createContext<ActiveContextValue | null>(null);

interface ActiveContextProviderProps {
  currentUser: HouseholdMemberOption;
  householdMembers: HouseholdMemberOption[];
  savedGroups: SavedGroupOption[];
  initialContext: PersistedRecommendationContext;
  children: ReactNode;
}

function buildContextState(
  context: Pick<PersistedRecommendationContext, "mode" | "selectedUserIds" | "savedGroupId" | "source">,
  householdMembers: HouseholdMemberOption[],
): PersistedRecommendationContext {
  const selectedUserIds = [...context.selectedUserIds];
  const activeNames = selectedUserIds
    .map((userId) => householdMembers.find((member) => member.id === userId)?.name)
    .filter((name): name is string => Boolean(name));

  return {
    ...context,
    selectedUserIds,
    activeNames,
    isGroupMode: context.mode === "GROUP" && selectedUserIds.length > 1,
  };
}

export function ActiveContextProvider({
  currentUser,
  householdMembers,
  savedGroups,
  initialContext,
  children,
}: ActiveContextProviderProps) {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contextState, setContextState] = useState(() =>
    buildContextState(initialContext, householdMembers),
  );

  useEffect(() => {
    setContextState(buildContextState(initialContext, householdMembers));
  }, [householdMembers, initialContext]);

  const persistNextContext = useCallback((nextContext: PersistedRecommendationContext) => {
    const previous = contextState;
    setContextState(nextContext);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/recommendation-context", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: nextContext.mode,
            selectedUserIds: nextContext.selectedUserIds,
            savedGroupId: nextContext.savedGroupId,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Unable to save recommendation context.");
        }

        const savedContext = (await response.json()) as PersistedRecommendationContext;
        setContextState(buildContextState(savedContext, householdMembers));
        router.refresh();
      } catch (persistError) {
        setContextState(previous);
        setError(
          persistError instanceof Error
            ? persistError.message
            : "Unable to save recommendation context.",
        );
      }
    });
  }, [contextState, householdMembers, router]);

  const value = useMemo<ActiveContextValue>(() => {
    return {
      householdMembers,
      savedGroups,
      selectedUserIds: contextState.selectedUserIds,
      activeNames: contextState.activeNames,
      activeMode: contextState.mode,
      activeSavedGroupId: contextState.savedGroupId,
      isGroupMode: contextState.isGroupMode,
      isSaving,
      error,
      setSolo: (userId = currentUser.id) => {
        persistNextContext(
          buildContextState(
            {
              mode: "SOLO",
              selectedUserIds: [userId],
              savedGroupId: null,
              source: "solo_profile",
            },
            householdMembers,
          ),
        );
      },
      setSelection: (userIds) => {
        const selectedUserIds = [...new Set(userIds.filter(Boolean))];

        if (selectedUserIds.length <= 1) {
          persistNextContext(
            buildContextState(
              {
                mode: "SOLO",
                selectedUserIds: [selectedUserIds[0] ?? currentUser.id],
                savedGroupId: null,
                source: "solo_profile",
              },
              householdMembers,
            ),
          );
          return;
        }

        persistNextContext(
          buildContextState(
            {
              mode: "GROUP",
              selectedUserIds,
              savedGroupId: null,
              source: "ad_hoc_group",
            },
            householdMembers,
          ),
        );
      },
      activateSavedGroup: (groupId) => {
        const group = savedGroups.find((item) => item.id === groupId);

        if (!group) {
          return;
        }

        persistNextContext(
          buildContextState(
            {
              mode: "GROUP",
              selectedUserIds: group.userIds,
              savedGroupId: group.id,
              source: "saved_group",
            },
            householdMembers,
          ),
        );
      },
    };
  }, [
    contextState.activeNames,
    contextState.isGroupMode,
    contextState.mode,
    contextState.savedGroupId,
    contextState.selectedUserIds,
    currentUser.id,
    error,
    householdMembers,
    isSaving,
    persistNextContext,
    savedGroups,
  ]);

  return <ActiveContext.Provider value={value}>{children}</ActiveContext.Provider>;
}

export function useActiveContext() {
  const context = useContext(ActiveContext);

  if (!context) {
    throw new Error("useActiveContext must be used inside ActiveContextProvider");
  }

  return context;
}
