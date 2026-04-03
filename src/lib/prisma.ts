import { PrismaClient } from "@prisma/client";

declare global {
  var __screenlanternPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__screenlanternPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__screenlanternPrisma = prisma;
}
