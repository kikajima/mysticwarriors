-- Oficina/Crafting: fila persistente de fabricação (espelho SQLite da produção).

CREATE TABLE "CraftJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "outputItemId" TEXT NOT NULL,
  "outputQuantity" INTEGER NOT NULL DEFAULT 1,
  "outputKind" TEXT NOT NULL,
  "academicLevelStart" INTEGER NOT NULL DEFAULT 0,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" DATETIME NOT NULL,
  CONSTRAINT "CraftJob_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CraftJob_playerId_key" ON "CraftJob"("playerId");
CREATE INDEX "CraftJob_endsAt_idx" ON "CraftJob"("endsAt");
