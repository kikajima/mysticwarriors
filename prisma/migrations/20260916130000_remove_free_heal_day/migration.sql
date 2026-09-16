-- A cura hospitalar sempre usa o custo normal.
-- A remoção desta coluna não altera personagens nem seu progresso.
ALTER TABLE "Player" DROP COLUMN "freeHealDay";