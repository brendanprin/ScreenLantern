import type { DefaultSession } from "next-auth";
import type { HouseholdRole } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    householdId: string;
    householdRole: HouseholdRole;
    preferredProviders: string[];
  }

  interface Session {
    user: {
      id: string;
      householdId: string;
      householdRole: HouseholdRole;
      preferredProviders: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    householdId?: string;
    householdRole?: HouseholdRole;
    preferredProviders?: string[];
  }
}
