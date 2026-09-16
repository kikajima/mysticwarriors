-- =====================================================================
-- v0.14 — AUDITORIA DE AÇÕES ADMINISTRATIVAS (exclusões do painel)
-- ---------------------------------------------------------------------
-- Tabela do log de ações destrutivas do painel admin: excluir personagem
-- e excluir guilda (ver src/lib/game/adminErasure.ts). Cada linha:
-- timestamp, e-mail do admin, alvo (nome/tipo), camadas afetadas
-- (local/nuvem), resultado e detalhes (inventário do que morreu /
-- erros / gatilho).
--
-- PROJETO DA TABELA:
--  * ZERO FKs — registro HISTÓRICO: sobrevive à morte do que registra
--    e ao reset geral do servidor (accountability não morre com o
--    mundo). Por isso não entra na matriz anti-órfã (nada para órfar);
--  * result: "ok" | "partial" | "failed" | "blocked" — tentativas
--    bloqueadas (bot, próprio admin, guilda do sistema, nome errado)
--    também ficam registradas;
--  * layers (JSON): estado por camada —
--      local: "ok" | "failed" | "skipped" | "na"
--      cloud: "ok" | "failed" | "skipped" | "not-mirrored" | "na"
--
-- Aditiva e idempotente por CREATE IF NOT EXISTS (cadeia de migrations,
-- aplicada pelo boot via applyPendingMigrations).
-- =====================================================================

CREATE TABLE IF NOT EXISTS "AdminActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "layers" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AdminActionLog_createdAt_idx" ON "AdminActionLog"("createdAt");
