-- =====================================================================
-- v0.15 — A GUILDA DO SISTEMA MORRE (DECISÃO FINAL DO DONO)
-- ---------------------------------------------------------------------
-- "Guilda de sistema/semente automática NÃO EXISTE MAIS. O mundo começa
--  com ZERO guildas — guildas só passam a existir quando jogadores as
--  criarem." (registrado em DESIGN-DECISIONS.md — nenhum agent futuro
--  reimplanta seed de guilda por iniciativa própria)
--
-- O mecanismo (ensureSystemGuild) foi removido do código nesta versão.
-- Esta migration é o ERASURE da instância que ainda exista em QUALQUER
-- base (dev ou produção): roda onde a cadeia rodar, é idempotente e
-- nunca toca em guildas de jogadores (o alvo é SÓ a flag isSystem).
--
-- ERASURE guild-scoped (mesma regra da exclusão de guilda do painel):
--   1. memberships → membros ficam SEM guilda (SET NULL), íntegros
--      (o Mestre Kame, quando existir, volta a bot sem guilda);
--   2. doações da guilda de sistema → apagadas (⚠ GuildDonation.guildId
--      NÃO tem FK nesta base — era v0.9.20 — a limpeza é MANUAL aqui,
--      na mesma operação, senão nascem órfãs lógicas);
--   3. a linha da guilda (nome, MOTD/descrição, nível, progresso);
--   4. a COLUNA isSystem morre junto — sem ela, nenhuma ferramenta
--      futura consegue distinguir "guilda de sistema" de guilda de
--      jogador: o conceito deixa de EXISTIR no banco.
--
-- O nome "Tropa da Tartaruga" fica LIBERADO: qualquer jogador pode
-- fundar a própria guilda com esse nome — sem conflito, sem proteção.
--
-- Cadeia em base NOVA: v0924 adiciona a coluna (histórico imutável),
-- v015 a remove — o banco nasce sem o conceito. A produção NÃO pode
-- nascer com a guilda de sistema: nada na cadeia a cria (a criação era
-- runtime via ensureSystemGuild, agora extinto).
-- =====================================================================

-- 1) membros da guilda de sistema ficam SEM guilda (nunca órfãos)
UPDATE "Player" SET "guildId" = NULL
WHERE "guildId" IN (SELECT "id" FROM "Guild" WHERE "isSystem" = true);

-- 2) TODO o histórico de doações da guilda de sistema (sem FK — manual)
DELETE FROM "GuildDonation"
WHERE "guildId" IN (SELECT "id" FROM "Guild" WHERE "isSystem" = true);

-- 3) a linha da guilda de sistema (a única — a flag era exclusiva dela)
DELETE FROM "Guild" WHERE "isSystem" = true;

-- 4) o conceito morre no schema: a coluna deixa de existir
ALTER TABLE "Guild" DROP COLUMN "isSystem";
