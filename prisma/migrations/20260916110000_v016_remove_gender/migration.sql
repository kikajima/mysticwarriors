-- v0.16 — Remoção DEFINITIVA do gênero do jogador (3ª ordem).
-- Contexto: a coluna nasceu na v0.3 (add_gender_to_player) como mecânica de
-- criação de personagem; a 1ª remoção (v0.11) foi perdida no rollback de
-- plataforma de 15/set (nunca commitada — ver worklog). Esta migration
-- conclui a remoção na base real.
--
-- DECISÃO (DESIGN-DECISIONS.md): gênero não existe mais como mecânica do
-- JOGADOR. Bots NPC mantêm identidade de lore (nomes femininos/masculinos
-- do mundo do jogo continuam) — apenas o campo mecânico do jogador sai.
-- Histórico de analytics (eventos antigos com gender) permanece intocado.

ALTER TABLE "Player" DROP COLUMN "gender";
