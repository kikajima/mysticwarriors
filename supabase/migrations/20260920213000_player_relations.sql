-- Relações sociais persistentes no banco autoritativo.
CREATE TABLE IF NOT EXISTS game."PlayerRelation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "targetPlayerId" TEXT NOT NULL,
  "targetPlayerName" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('friend','blocked')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "PlayerRelation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES game."Player"("id") ON DELETE CASCADE,
  CONSTRAINT "PlayerRelation_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES game."Player"("id") ON DELETE CASCADE,
  CONSTRAINT "PlayerRelation_not_self" CHECK ("playerId" <> "targetPlayerId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerRelation_playerId_targetPlayerId_key" ON game."PlayerRelation"("playerId","targetPlayerId");
CREATE INDEX IF NOT EXISTS "PlayerRelation_playerId_status_idx" ON game."PlayerRelation"("playerId","status");
CREATE INDEX IF NOT EXISTS "PlayerRelation_targetPlayerId_status_idx" ON game."PlayerRelation"("targetPlayerId","status");
