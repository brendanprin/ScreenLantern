import Link from "next/link";

import { Button } from "@/components/ui/button";

interface PaginationNavProps {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

export function PaginationNav({
  page,
  totalPages,
  buildHref,
}: PaginationNavProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <Button asChild disabled={page <= 1} variant="outline">
        <Link
          aria-disabled={page <= 1}
          className={page <= 1 ? "pointer-events-none opacity-50" : ""}
          href={buildHref(Math.max(1, page - 1))}
        >
          Previous
        </Link>
      </Button>
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <Button asChild disabled={page >= totalPages} variant="outline">
        <Link
          aria-disabled={page >= totalPages}
          className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
          href={buildHref(Math.min(totalPages, page + 1))}
        >
          Next
        </Link>
      </Button>
    </div>
  );
}

