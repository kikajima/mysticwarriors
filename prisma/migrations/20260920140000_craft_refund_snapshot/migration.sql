-- Crafting completo: snapshot de custo/ingredientes para cancelamento seguro.
ALTER TABLE "CraftJob" ADD COLUMN "batchQuantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CraftJob" ADD COLUMN "spentZeni" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CraftJob" ADD COLUMN "ingredientsJson" TEXT NOT NULL DEFAULT '[]';
