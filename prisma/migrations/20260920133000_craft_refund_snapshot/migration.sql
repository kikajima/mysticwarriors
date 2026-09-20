-- Crafting completo: snapshot exato dos insumos consumidos no início.

ALTER TABLE "CraftJob"
  ADD COLUMN "inputZeni" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CraftJob"
  ADD COLUMN "inputIngredients" TEXT NOT NULL DEFAULT '[]';
