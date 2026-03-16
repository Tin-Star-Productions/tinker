import { PrismaClient } from "@prisma/client";

// Re-export all Prisma types for consumer packages
export * from "@prisma/client";

// Singleton pattern — safe for both long-lived server processes and hot-reload dev
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
