-- Profissões: carreira 1–10, turnos flexíveis e inventário de materiais.
-- Migração aditiva: nenhum personagem, conta, guilda ou item legado é removido.

ALTER TABLE game."Player"
  ADD COLUMN IF NOT EXISTS "missionStartedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "missionHours" INTEGER;

CREATE TABLE IF NOT EXISTS game."InventoryStack" (
  "playerId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryStack_pkey" PRIMARY KEY ("playerId", "itemId"),
  CONSTRAINT "InventoryStack_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES game."Player"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "InventoryStack_itemId_idx"
  ON game."InventoryStack"("itemId");

REVOKE ALL ON TABLE game."InventoryStack" FROM anon, authenticated;
