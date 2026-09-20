-- Crafting completo: snapshot de custo/ingredientes para cancelamento seguro.
ALTER TABLE game."CraftJob"
  ADD COLUMN IF NOT EXISTS "batchQuantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "spentZeni" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ingredientsJson" TEXT NOT NULL DEFAULT '[]';
