-- Crafting completo: maestria própria + fila de produção.
ALTER TABLE game."Player"
  ADD COLUMN IF NOT EXISTS "craftingXp" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "craftsCompleted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE game."CraftJob"
  DROP CONSTRAINT IF EXISTS "CraftJob_playerId_key";

ALTER TABLE game."CraftJob"
  ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "CraftJob_playerId_position_key"
  ON game."CraftJob"("playerId","position");

CREATE INDEX IF NOT EXISTS "CraftJob_playerId_endsAt_idx"
  ON game."CraftJob"("playerId","endsAt");
