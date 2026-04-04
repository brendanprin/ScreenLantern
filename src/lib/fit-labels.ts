import type { RecommendationExplanation } from "@/lib/types";

export function deriveCompactFitLabel(args: {
  explanations: RecommendationExplanation[];
  isGroupMode: boolean;
  contextLabel?: string;
}) {
  if (args.explanations.length === 0) {
    return null;
  }

  const categories = new Set(args.explanations.map((explanation) => explanation.category));

  if (args.isGroupMode) {
    if (categories.has("group_watch_history")) {
      return "Watched together";
    }

    if (categories.has("group_overlap")) {
      return "Strong shared fit";
    }

    if (categories.has("watchlist_resurface")) {
      return "Shared planning pick";
    }

    if (categories.has("provider_match") || categories.has("runtime_fit")) {
      return "Safe compromise";
    }

    return "Group fit";
  }

  if (categories.has("watchlist_resurface")) {
    return "Back on your radar";
  }

  if (categories.has("genre_overlap")) {
    return args.contextLabel ? `Best for ${args.contextLabel}` : "Best solo fit";
  }

  if (categories.has("provider_match") || categories.has("runtime_fit")) {
    return "Good solo fit";
  }

  return null;
}
