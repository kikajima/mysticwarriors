-- =====================================================================
-- v0.9.6 (Mudança 3) — SEPARAR PERSONAGEM DE CONTA (banco LOCAL)
-- ---------------------------------------------------------------------
-- A posse de cosméticos saiu da CONTA (tabela CosmeticOwned) e passou a
-- ser do PERSONAGEM (nova coluna Player.cosmeticsOwned, JSON array de
-- ids). Carteira (zeni/cristais), itens, XP, energia, profissões etc.
-- JÁ eram colunas do Player — cosméticos eram a única exceção.
--
-- MIGRAÇÃO DE DADOS (regra do dono: ninguém perde nada):
-- a lista de cosméticos da conta é DUPLICADA para cada personagem dela.
-- Ex.: conta com "aura_chama" e 2 personagens → cada um fica com
-- "aura_chama" na própria lista.
--
-- A tabela CosmeticOwned NÃO é apagada — permanece como backup/auditoria.
-- =====================================================================

-- 1) Nova coluna (nullable; null = "[]" para efeitos do jogo)
ALTER TABLE "Player" ADD COLUMN "cosmeticsOwned" TEXT;

-- 2) Duplica a posse da conta para cada personagem existente.
--    json_group_array sobre zero linhas devolve '[]' (conta sem cosméticos
--    ou personagem sem conta) — ninguém fica com null.
UPDATE "Player"
SET "cosmeticsOwned" = COALESCE(
  (
    SELECT json_group_array("CosmeticOwned"."cosmetic")
    FROM "CosmeticOwned"
    WHERE "CosmeticOwned"."accountId" = "Player"."accountId"
  ),
  '[]'
);

-- 3) Personagens sem conta (raros) também ficam com lista vazia explícita
UPDATE "Player" SET "cosmeticsOwned" = '[]' WHERE "cosmeticsOwned" IS NULL;
