import type {
  ProviderHandoffEntry,
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

export function buildProviderHandoffUrl(
  providerName: string,
  title: TitleSummary,
): string | null {
  const query = buildSearchQuery(title);
  const normalized = normalizeProviderName(providerName);

  if (normalized === "netflix") {
    return `https://www.netflix.com/search?q=${query}`;
  }

  if (normalized === "hulu") {
    return `https://www.hulu.com/search?q=${query}`;
  }

  if (normalized === "prime video" || normalized === "amazon prime video") {
    return `https://www.amazon.com/s?k=${query}&i=instant-video`;
  }

  if (normalized === "max" || normalized === "hbo max") {
    return `https://play.max.com/search?q=${query}`;
  }

  if (
    normalized === "apple tv plus" ||
    normalized === "apple tv" ||
    normalized === "apple tv plus apple tv"
  ) {
    return `https://tv.apple.com/search?term=${query}`;
  }

  if (normalized === "peacock") {
    return `https://www.peacocktv.com/search?query=${query}`;
  }

  return null;
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

  return title.providers.some((provider) => preferredProviders.includes(provider.name))
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
      const handoffUrl = buildProviderHandoffUrl(provider.name, title);

      return {
        providerName: provider.name,
        availabilityLabel: getProviderAvailabilityLabel(provider.type),
        isSelectedService: preferredProviders.includes(provider.name),
        handoffUrl,
        handoffKind: handoffUrl ? ("provider_search" as const) : null,
        typePriority: providerTypePriority(provider.type),
      };
    })
    .sort((left, right) => {
      if (left.isSelectedService !== right.isSelectedService) {
        return left.isSelectedService ? -1 : 1;
      }

      if (left.typePriority !== right.typePriority) {
        return left.typePriority - right.typePriority;
      }

      if (Boolean(left.handoffUrl) !== Boolean(right.handoffUrl)) {
        return left.handoffUrl ? -1 : 1;
      }

      return left.providerName.localeCompare(right.providerName);
    })
    .map(({ typePriority, ...entry }) => entry);
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

  const anyOpenable = entries.filter((entry) => Boolean(entry.handoffUrl));
  const openableOptions = anyOpenable;
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
