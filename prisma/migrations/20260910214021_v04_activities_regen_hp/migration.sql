-- AlterTable
ALTER TABLE "Player" ADD COLUMN "lastRegenHp" DATETIME;

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Activity_playerId_completedAt_idx" ON "Activity"("playerId", "completedAt");

-- CreateIndex
CREATE INDEX "Activity_endsAt_idx" ON "Activity"("endsAt");
