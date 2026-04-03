"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface HouseholdMember {
  id: string;
  name: string;
}

interface SavedGroup {
  id: string;
  name: string;
  userIds: string[];
}

interface ActiveContextValue {
  householdMembers: HouseholdMember[];
  savedGroups: SavedGroup[];
  selectedUserIds: string[];
  activeNames: string[];
  isGroupMode: boolean;
  setSolo: () => void;
  setSelection: (userIds: string[]) => void;
  activateSavedGroup: (groupId: string) => void;
}

const ActiveContext = createContext<ActiveContextValue | null>(null);

interface ActiveContextProviderProps {
  householdId: string;
  currentUser: HouseholdMember;
  householdMembers: HouseholdMember[];
  savedGroups: SavedGroup[];
  children: ReactNode;
}

export function ActiveContextProvider({
  householdId,
  currentUser,
  householdMembers,
  savedGroups,
  children,
}: ActiveContextProviderProps) {
  const storageKey = `screenlantern:context:${householdId}`;
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([
    currentUser.id,
  ]);

  useEffect(() => {
    const savedValue = window.localStorage.getItem(storageKey);

    if (!savedValue) {
      return;
    }

    try {
      const parsed = JSON.parse(savedValue) as { userIds?: string[] };
      const validUserIds = (parsed.userIds ?? []).filter((userId) =>
        householdMembers.some((member) => member.id === userId),
      );

      if (validUserIds.length > 0) {
        setSelectedUserIds(validUserIds);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [householdMembers, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ userIds: selectedUserIds }),
    );
  }, [selectedUserIds, storageKey]);

  const value = useMemo<ActiveContextValue>(() => {
    const activeNames = selectedUserIds
      .map((userId) => householdMembers.find((member) => member.id === userId)?.name)
      .filter((name): name is string => Boolean(name));

    return {
      householdMembers,
      savedGroups,
      selectedUserIds,
      activeNames,
      isGroupMode: selectedUserIds.length > 1,
      setSolo: () => setSelectedUserIds([currentUser.id]),
      setSelection: (userIds) =>
        setSelectedUserIds(userIds.length ? userIds : [currentUser.id]),
      activateSavedGroup: (groupId) => {
        const group = savedGroups.find((item) => item.id === groupId);

        if (group) {
          setSelectedUserIds(group.userIds);
        }
      },
    };
  }, [currentUser.id, householdMembers, savedGroups, selectedUserIds]);

  return (
    <ActiveContext.Provider value={value}>{children}</ActiveContext.Provider>
  );
}

export function useActiveContext() {
  const context = useContext(ActiveContext);

  if (!context) {
    throw new Error("useActiveContext must be used inside ActiveContextProvider");
  }

  return context;
}

