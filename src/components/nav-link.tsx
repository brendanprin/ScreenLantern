"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

interface NavLinkProps {
  href: string;
  label: string;
}

export function NavLink({ href, label }: NavLinkProps) {
  const pathname = usePathname();
  const safePathname = pathname ?? "";
  const isActive =
    safePathname === href || safePathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-4 py-2 text-sm transition",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
