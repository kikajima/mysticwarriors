-- Profissões: carreira 1–10, turnos flexíveis e inventário de materiais.
-- Produção PostgreSQL recebe a migration equivalente via Supabase.

ALTER TABLE "Player" ADD COLUMN "missionStartedAt" DATETIME;
ALTER TABLE "Player" ADD COLUMN "missionHours" INTEGER;

CREATE TABLE "InventoryStack" (
    "playerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryStack_pkey" PRIMARY KEY ("playerId", "itemId"),
    CONSTRAINT "InventoryStack_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InventoryStack_itemId_idx" ON "InventoryStack"("itemId");
