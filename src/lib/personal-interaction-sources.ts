import { InteractionType, SourceContext } from "@prisma/client";

import type {
  LibrarySourceFilter,
  PersonalInteractionOrigin,
  PersonalInteractionSourceState,
} from "@/lib/types";

export function getPersonalInteractionOrigin(
  sourceContext: SourceContext,
): PersonalInteractionOrigin {
  return sourceContext === SourceContext.IMPORTED ? "trakt" : "manual";
}

export function getInteractionOriginForType(
  state: PersonalInteractionSourceState | null | undefined,
  interactionType: InteractionType,
) {
  if (!state) {
    return null;
  }

  return state[interactionType] ?? null;
}

export function matchesLibrarySourceFilter(
  origin: PersonalInteractionOrigin | null,
  sourceFilter: LibrarySourceFilter,
) {
  if (sourceFilter === "all") {
    return true;
  }

  if (sourceFilter === "imported") {
    return origin === "trakt";
  }

  return origin === "manual";
}

export function getLibrarySourceBadge(args: {
  origin: PersonalInteractionOrigin | null;
  sourceFilter: LibrarySourceFilter;
}) {
  if (args.origin === "trakt") {
    return "Imported from Trakt";
  }

  if (args.origin === "manual" && args.sourceFilter === "manual") {
    return "Added in ScreenLantern";
  }

  return null;
}

export function getPersonalInteractionOriginLabel(args: {
  interactionType: InteractionType;
  origin: PersonalInteractionOrigin;
}) {
  if (args.origin === "trakt") {
    if (args.interactionType === InteractionType.WATCHED) {
      return "Watched via Trakt sync";
    }

    if (args.interactionType === InteractionType.WATCHLIST) {
      return "Imported from Trakt watchlist";
    }

    if (args.interactionType === InteractionType.LIKE) {
      return "Liked via Trakt ratings";
    }

    if (args.interactionType === InteractionType.DISLIKE) {
      return "Disliked via Trakt ratings";
    }

    return "Imported from Trakt";
  }

  if (args.interactionType === InteractionType.WATCHED) {
    return "Marked watched in ScreenLantern";
  }

  if (args.interactionType === InteractionType.WATCHLIST) {
    return "Added in ScreenLantern";
  }

  if (args.interactionType === InteractionType.LIKE) {
    return "Liked in ScreenLantern";
  }

  if (args.interactionType === InteractionType.DISLIKE) {
    return "Marked not for me in ScreenLantern";
  }

  return "Added in ScreenLantern";
}
