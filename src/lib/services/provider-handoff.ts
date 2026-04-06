import type {
  ProviderHandoffEntry,
  ProviderHandoffKind,
  SelectedServiceAvailability,
  TitleHandoffSummary,
  TitleSummary,
} from "@/lib/types";

const PROVIDER_TYPE_PRIORITY: Record<string, number> = {
  flatrate: 0,
  free: 1,
  ads: 2,
  rent: 3,
  buy: 4,
};

const PROVIDER_HANDOFF_PRIORITY: Record<ProviderHandoffKind, number> = {
  title_direct: 0,
  provider_search: 1,
  provider_home: 2,
};

interface ProviderHandoffStrategy {
  id: string;
  aliases: string[];
  handoffKind: ProviderHandoffKind;
  buildUrl: (query: string) => string;
}

const PROVIDER_HANDOFF_STRATEGIES: ProviderHandoffStrategy[] = [
  {
    id: "netflix",
    aliases: ["netflix"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://www.netflix.com/search?q=${query}`,
  },
  {
    id: "hulu",
    aliases: ["hulu"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://www.hulu.com/search?q=${query}`,
  },
  {
    id: "prime_video",
    aliases: ["prime video", "amazon prime video"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://www.amazon.com/s?k=${query}&i=instant-video`,
  },
  {
    id: "max",
    aliases: ["max", "hbo max"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://play.max.com/search?q=${query}`,
  },
  {
    id: "apple_tv_plus",
    aliases: ["apple tv", "apple tv plus"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://tv.apple.com/search?term=${query}`,
  },
  {
    id: "peacock",
    aliases: ["peacock"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://www.peacocktv.com/search?query=${query}`,
  },
  {
    id: "paramount_plus",
    aliases: [
      "paramount plus",
      "paramount plus premium",
      "paramount plus essential",
    ],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://www.paramountplus.com/search/?q=${query}`,
  },
  {
    id: "plex",
    aliases: ["plex"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://watch.plex.tv/search?q=${query}`,
  },
  {
    id: "tubi",
    aliases: ["tubi tv"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://tubitv.com/search/${query}`,
  },
  {
    id: "youtube",
    aliases: ["youtube", "youtube premium", "youtube free"],
    handoffKind: "provider_search",
    buildUrl: (query) => `https://www.youtube.com/results?search_query=${query}`,
  },
];

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function buildSearchQuery(title: TitleSummary) {
  const year = title.releaseYear ?? null;
  return encodeURIComponent(year ? `${title.title} ${year}` : title.title);
}

function normalizeProviderName(name: string) {
  return name
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveProviderHandoffStrategy(providerName: string) {
  const normalized = normalizeProviderName(providerName);

  return (
    PROVIDER_HANDOFF_STRATEGIES.find((strategy) => strategy.aliases.includes(normalized)) ??
    null
  );
}

function providerHandoffPriority(kind?: ProviderHandoffKind | null) {
  if (!kind) {
    return Number.MAX_SAFE_INTEGER;
  }

  return PROVIDER_HANDOFF_PRIORITY[kind] ?? Number.MAX_SAFE_INTEGER;
}

function matchesPreferredProvider(providerName: string, preferredProviders: string[]) {
  const providerStrategy = resolveProviderHandoffStrategy(providerName);

  return preferredProviders.some((preferredProvider) => {
    const preferredStrategy = resolveProviderHandoffStrategy(preferredProvider);

    if (providerStrategy && preferredStrategy) {
      return providerStrategy.id === preferredStrategy.id;
    }

    return normalizeProviderName(providerName) === normalizeProviderName(preferredProvider);
  });
}

function providerTypePriority(type?: string | null) {
  if (!type) {
    return Number.MAX_SAFE_INTEGER;
  }

  return PROVIDER_TYPE_PRIORITY[type] ?? Number.MAX_SAFE_INTEGER;
}

function resolveProviderStatus(title: TitleSummary) {
  if (
    title.providerStatus === "available" ||
    title.providerStatus === "unavailable" ||
    title.providerStatus === "unknown"
  ) {
    return title.providerStatus;
  }

  return title.providers.length > 0 ? "available" : "unknown";
}

export function getProviderAvailabilityLabel(type?: string | null) {
  if (type === "flatrate") {
    return "Included";
  }

  if (type === "free") {
    return "Free";
  }

  if (type === "ads") {
    return "With ads";
  }

  if (type === "rent") {
    return "Rent";
  }

  if (type === "buy") {
    return "Buy";
  }

  return null;
}

export function getProviderHandoffActionLabel(
  kind: ProviderHandoffKind | null | undefined,
  providerName: string,
) {
  if (kind === "title_direct") {
    return `Open in ${providerName}`;
  }

  if (kind === "provider_search") {
    return `Search in ${providerName}`;
  }

  if (kind === "provider_home") {
    return `Browse in ${providerName}`;
  }

  return null;
}

export function getProviderHandoffSupportLabel(
  kind: ProviderHandoffKind | null | undefined,
) {
  if (kind === "title_direct") {
    return "Direct open";
  }

  if (kind === "provider_search") {
    return "Search available";
  }

  if (kind === "provider_home") {
    return "Browse available";
  }

  return "Availability only";
}

export function getProviderHandoffDescription(
  kind: ProviderHandoffKind | null | undefined,
  providerName: string,
) {
  if (kind === "title_direct") {
    return `This opens the title directly in ${providerName}.`;
  }

  if (kind === "provider_search") {
    return `This opens search results in ${providerName} for this title.`;
  }

  if (kind === "provider_home") {
    return `This opens ${providerName} so you can keep browsing there.`;
  }

  return null;
}

export function buildProviderHandoffUrl(
  providerName: string,
  title: TitleSummary,
): string | null {
  const query = buildSearchQuery(title);
  const strategy = resolveProviderHandoffStrategy(providerName);

  return strategy ? strategy.buildUrl(query) : null;
}

function getProviderHandoffKind(providerName: string) {
  return resolveProviderHandoffStrategy(providerName)?.handoffKind ?? null;
}

function classifySelectedAvailability(
  title: TitleSummary,
  preferredProviders: string[],
): SelectedServiceAvailability {
  const providerStatus = resolveProviderStatus(title);

  if (providerStatus === "unknown") {
    return "unknown";
  }

  if (providerStatus !== "available") {
    return "unavailable";
  }

  return title.providers.some((provider) =>
    matchesPreferredProvider(provider.name, preferredProviders),
  )
    ? "selected_services"
    : "other_services";
}

function buildProviderEntries(
  title: TitleSummary,
  preferredProviders: string[],
): ProviderHandoffEntry[] {
  const bestByName = new Map<string, (typeof title.providers)[number]>();

  title.providers.forEach((provider) => {
    const existing = bestByName.get(provider.name);

    if (
      !existing ||
      providerTypePriority(provider.type) < providerTypePriority(existing.type)
    ) {
      bestByName.set(provider.name, provider);
    }
  });

  return [...bestByName.values()]
    .map((provider) => {
      const handoffKind = getProviderHandoffKind(provider.name);
      const handoffUrl = buildProviderHandoffUrl(provider.name, title);

      return {
        providerName: provider.name,
        availabilityLabel: getProviderAvailabilityLabel(provider.type),
        isSelectedService: matchesPreferredProvider(provider.name, preferredProviders),
        handoffUrl,
        handoffKind: handoffUrl ? handoffKind : null,
        typePriority: providerTypePriority(provider.type),
        handoffPriority: providerHandoffPriority(handoffKind),
      };
    })
    .sort((left, right) => {
      if (left.isSelectedService !== right.isSelectedService) {
        return left.isSelectedService ? -1 : 1;
      }

      if (left.handoffPriority !== right.handoffPriority) {
        return left.handoffPriority - right.handoffPriority;
      }

      if (left.typePriority !== right.typePriority) {
        return left.typePriority - right.typePriority;
      }

      return left.providerName.localeCompare(right.providerName);
    })
    .map(({ handoffPriority, typePriority, ...entry }) => entry);
}

function buildActionableOptions(entries: ProviderHandoffEntry[]) {
  const actionable = entries.filter(
    (entry) => Boolean(entry.handoffUrl) && Boolean(entry.handoffKind),
  );
  const higherConfidence = actionable.filter(
    (entry) => entry.handoffKind !== "provider_home",
  );

  return higherConfidence.length > 0 ? higherConfidence : actionable;
}

export function buildTitleHandoff(
  title: TitleSummary,
  preferredProviders: string[],
  region: string,
): TitleHandoffSummary {
  const providerStatus = resolveProviderStatus(title);
  const selectedAvailability = classifySelectedAvailability(title, preferredProviders);

  if (providerStatus === "unknown") {
    return {
      status: "unknown",
      region,
      selectedAvailability,
      primaryOption: null,
      openableOptions: [],
      entries: [],
      fallbackMessage: `Provider availability is currently unavailable for ${region}.`,
    };
  }

  const entries = buildProviderEntries(title, preferredProviders);

  if (providerStatus !== "available" || entries.length === 0) {
    return {
      status: "unavailable",
      region,
      selectedAvailability,
      primaryOption: null,
      openableOptions: [],
      entries,
      fallbackMessage: `No watch providers were found for ${region}.`,
    };
  }

  const openableOptions = buildActionableOptions(entries);
  const primaryOption = openableOptions[0] ?? null;

  if (!primaryOption) {
    const preferredEntries = entries.filter((entry) => entry.isSelectedService);
    const providerNames = formatList(
      (preferredEntries.length > 0 ? preferredEntries : entries).map(
        (entry) => entry.providerName,
      ),
    );
    const prefix =
      preferredEntries.length > 0 ? "Available on your services" : `Available on ${providerNames}`;

    return {
      status: "availability_only",
      region,
      selectedAvailability,
      primaryOption: null,
      openableOptions: [],
      entries,
      fallbackMessage: `${prefix}, but direct open is unavailable.`,
    };
  }

  return {
    status: "openable",
    region,
    selectedAvailability,
    primaryOption,
    openableOptions,
    entries,
    fallbackMessage: null,
  };
}
