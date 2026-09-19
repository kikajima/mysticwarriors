-- Oficina/Crafting: fila de fabricação persistente por personagem.
-- Aditiva: não altera nem remove progresso existente.

CREATE TABLE IF NOT EXISTS game."CraftJob" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "outputItemId" TEXT NOT NULL,
  "outputQuantity" INTEGER NOT NULL DEFAULT 1,
  "outputKind" TEXT NOT NULL,
  "academicLevelStart" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CraftJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CraftJob_playerId_key" UNIQUE ("playerId"),
  CONSTRAINT "CraftJob_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES game."Player"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CraftJob_endsAt_idx" ON game."CraftJob"("endsAt");

REVOKE ALL ON TABLE game."CraftJob" FROM anon, authenticated;
