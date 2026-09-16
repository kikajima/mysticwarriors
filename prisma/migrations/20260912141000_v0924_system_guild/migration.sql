-- =====================================================================
-- v0.9.24 (D2) — GUILDA PÚBLICA DO SISTEMA (banco LOCAL)
-- ---------------------------------------------------------------------
-- Novo campo Guild.isSystem: marca a guilda de boas-vindas (temática
-- Dragon Ball, ex.: "Tropa da Tartaruga") garantida no early game —
-- o playtest encontrou o sistema INTEIRO bloqueado (0 guildas, fundação
-- de 5.000 Zeni fora do alcance de iniciantes).
--
-- Sem vantagens especiais: a única diferença comportamental é NÃO ser
-- dissolvida quando esvazia (actionLeaveGuild protege a flag), garantindo
-- que sempre haja uma guilda pública para entrar.
--
-- A criação da guilda em si é feita em runtime (ensureSystemGuild) —
-- aqui entra apenas a coluna que a identifica.
-- =====================================================================

ALTER TABLE "Guild" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
