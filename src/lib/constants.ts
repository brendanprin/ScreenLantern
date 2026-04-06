export const APP_NAME = "ScreenLantern";

export const NAV_ITEMS = [
  { href: "/app", label: "Home" },
  { href: "/app/assistant", label: "Assistant" },
  { href: "/app/search", label: "Search" },
  { href: "/app/browse", label: "Browse" },
  { href: "/app/library", label: "Library" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/household", label: "Household" },
  { href: "/app/settings", label: "Settings" },
] as const;

export const PROVIDER_OPTIONS = [
  "Netflix",
  "Hulu",
  "Prime Video",
  "Disney Plus",
  "Max",
  "Apple TV Plus",
  "Peacock",
  "Paramount Plus",
  "Plex",
  "Tubi TV",
  "YouTube",
];

export const INTERACTION_LABELS = {
  WATCHLIST: "Watchlist",
  WATCHED: "Watched",
  LIKE: "Liked",
  DISLIKE: "Disliked",
  HIDE: "Hidden",
} as const;
