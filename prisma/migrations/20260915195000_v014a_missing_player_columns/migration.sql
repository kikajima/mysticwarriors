-- =====================================================================
-- v0.14a — COLUNAS DE PLAYER AUSENTES DA CADEIA (fecha a lacuna)
-- ---------------------------------------------------------------------
-- PROBLEMA (descoberto pelos testes herméticos v0.14): as colunas das
-- features v0.9.15–v0.9.18 (talentos de Ímpeto, conquistas narrativas,
-- torneio de artes marciais) existem NO SCHEMA e no banco de dev — mas
-- NENHUMA migration da cadeia as cria (foram aplicadas historicamente
-- por db:push, fora da cadeia). Um banco NOVO nascido da cadeia ficava
-- INCOMPATÍVEL com o client gerado (P2022 "column does not exist").
--
-- Esta migration fecha a lacuna: um banco nascido da cadeia completa
-- agora recebe as 6 colunas. Idempotência em bases JÁ migradas por
-- db:push: o registro da migration é marcado como aplicado (as colunas
-- já existem — ver scripts do boot; SQLite não tem ADD COLUMN IF NOT
-- EXISTS, e a verificação é feita antes de rodar).
-- =====================================================================

ALTER TABLE "Player" ADD COLUMN "miracleWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "davidWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "talents" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Player" ADD COLUMN "tournament" TEXT;
ALTER TABLE "Player" ADD COLUMN "tournamentTitles" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "tournamentRoundWins" INTEGER NOT NULL DEFAULT 0;
