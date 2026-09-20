-- Crafting completo: snapshot exato dos insumos consumidos no início.
-- Permite cancelamento com reembolso fiel mesmo após mudanças futuras no catálogo.

ALTER TABLE game."CraftJob"
  ADD COLUMN IF NOT EXISTS "inputZeni" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE game."CraftJob"
  ADD COLUMN IF NOT EXISTS "inputIngredients" TEXT NOT NULL DEFAULT '[]';
