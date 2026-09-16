-- =====================================================================
-- v0.9.24 (C2) — PRIMEIRA CURA DO DIA GRÁTIS (banco LOCAL)
-- ---------------------------------------------------------------------
-- Novo campo Player.freeHealDay: diaKey (YYYY-MM-DD, fuso SP) da última
-- cura gratuita usada no hospital. null / dia diferente = a gratuita
-- diária está disponível (o handler actionHeal compara com dayKey()).
--
-- ONBOARDING (dados do playtest): derrota por nocaute deixava o novato
-- no vermelho — cura total ~231 Zeni contra ~64 de vitória PvE. A
-- primeira cura do dia grátis resolve o começo do jogo sem tocar na
-- economia dos veteranos (as demais curas do dia seguem 3 Zeni/HP).
--
-- Aditivo e 100% reversível: coluna nullable, sem default, sem dados
-- migrados (null = gratuita disponível).
-- =====================================================================

ALTER TABLE "Player" ADD COLUMN "freeHealDay" TEXT;
