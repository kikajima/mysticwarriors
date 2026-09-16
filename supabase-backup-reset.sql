-- =====================================================================
-- GUERREIROS MÍSTICOS — BLOCO 1: BACKUP ANTES DO RESET GERAL (v0.9.10)
-- =====================================================================
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
--
-- O QUE ELE FAZ: cópia completa (estrutura + dados) das tabelas com
-- dados de jogador do Supabase:
--   * personagens  → personagens_backup_reset  (snapshot v3 completo
--                    de cada personagem: inventário, carteira, quests,
--                    conquistas — é o backup que permite restaurar um
--                    personagem à mão se algum dia for preciso);
--   * profiles     → profiles_backup_reset     (nick/nivel/xp/progresso
--                    — progresso é o formato v2 legado de transição);
--   * admins       → admins_backup_reset       (configuração — cópia
--                    por precaução; o reset NÃO mexe nela).
--
-- ORDEM OBRIGATÓRIA: rode ESTE bloco ANTES do botão "Reset geral do
-- servidor" (painel admin) e ANTES do BLOCO 2 (supabase-reset-geral.sql).
--
-- ⚠️ RODAR DE NOVO SUBSTITUI O BACKUP ANTERIOR (drop + recria). Só
--    re-execute se tiver certeza de que o backup antigo já está seguro.
--
-- Nota: o banco do JOGO (personagens vivos, carteiras, boss) também ganha
-- um backup físico automático no próprio servidor quando você clica no
-- botão de reset (VACUUM INTO — o caminho do arquivo aparece no
-- resultado). Este bloco cobre o lado da NUVEM.
-- =====================================================================

-- ===== 1) Cópia de personagens (dados de jogador na nuvem) =====
drop table if exists public.personagens_backup_reset;
create table public.personagens_backup_reset as
  select * from public.personagens;
  alter table public.personagens_backup_reset enable row level security;
  revoke all on table public.personagens_backup_reset from public, anon, authenticated;

-- ===== 2) Cópia de profiles (progresso v2 legado + nick) =====
drop table if exists public.profiles_backup_reset;
create table public.profiles_backup_reset as
  select * from public.profiles;
  alter table public.profiles_backup_reset enable row level security;
  revoke all on table public.profiles_backup_reset from public, anon, authenticated;

-- ===== 3) Cópia de admins (precaução — o reset não mexe nela) =====
drop table if exists public.admins_backup_reset;
create table public.admins_backup_reset as
  select * from public.admins;
  alter table public.admins_backup_reset enable row level security;
  revoke all on table public.admins_backup_reset from public, anon, authenticated;

-- ===== 4) VERIFICAÇÃO DO BACKUP (contagens esperadas: > 0 se havia
-- jogadores; o importante é bater com os números do passo 6 do BLOCO 2
-- executado ANTES do reset) =====
select 'personagens_backup_reset' as tabela_backup, count(*) as linhas from public.personagens_backup_reset
union all
select 'profiles_backup_reset', count(*) from public.profiles_backup_reset
union all
select 'admins_backup_reset', count(*) from public.admins_backup_reset
union all
select 'personagens (originais, ainda intactas)', count(*) from public.personagens
union all
select 'profiles (originais, ainda intactos)', count(*) from public.profiles;

-- ===== FIM DO BLOCO 1 — guarde o resultado e siga para o botão de
-- reset no painel admin (produção) e depois ao BLOCO 2 =====
