import { HistoryReviewClient } from "@/components/history/history-review-client";
import { getCurrentUserContext } from "@/lib/auth";
import { getWatchedHistoryForReview } from "@/lib/services/interactions";

export const metadata = { title: "Rate your history" };

const SOURCE_OPTIONS = ["all", "imported", "manual"] as const;
type SourceFilter = (typeof SOURCE_OPTIONS)[number];

export default async function HistoryReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUserContext();
  const resolvedParams = searchParams ? await searchParams : {};
  const rawSource = resolvedParams?.source;
  const source: SourceFilter =
    typeof rawSource === "string" && SOURCE_OPTIONS.includes(rawSource as SourceFilter)
      ? (rawSource as SourceFilter)
      : "all";

  const items = await getWatchedHistoryForReview(user.userId, source);

  return <HistoryReviewClient initialItems={items} activeSource={source} />;
}
