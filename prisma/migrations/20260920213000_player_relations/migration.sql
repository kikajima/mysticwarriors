-- Amizades e bloqueios de personagens.
CREATE TABLE "PlayerRelation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "targetPlayerId" TEXT NOT NULL,
  "targetPlayerName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerRelation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerRelation_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlayerRelation_playerId_targetPlayerId_key" ON "PlayerRelation"("playerId", "targetPlayerId");
CREATE INDEX "PlayerRelation_playerId_status_idx" ON "PlayerRelation"("playerId", "status");
CREATE INDEX "PlayerRelation_targetPlayerId_status_idx" ON "PlayerRelation"("targetPlayerId", "status");
