-- Crafting completo: maestria própria + fila de produção.
ALTER TABLE "Player" ADD COLUMN "craftingXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "craftsCompleted" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "CraftJob_playerId_key";
ALTER TABLE "CraftJob" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "CraftJob_playerId_position_key" ON "CraftJob"("playerId","position");
CREATE INDEX "CraftJob_playerId_endsAt_idx" ON "CraftJob"("playerId","endsAt");
