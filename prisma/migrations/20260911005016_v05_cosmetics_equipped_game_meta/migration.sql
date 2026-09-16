-- AlterTable
ALTER TABLE "Player" ADD COLUMN "cosmeticsEquipped" TEXT;

-- CreateTable
CREATE TABLE "GameMeta" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
