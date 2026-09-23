-- =====================================================================
-- MYST KI WARRIORS — BACKUP ANTES DA MIGRAÇÃO v0.9.6 (RODE PRIMEIRO)
-- ---------------------------------------------------------------------
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
--
-- O que faz: copia as tabelas atuais do jogo para tabelas de backup com
-- carimbo de data. É LEITURA PURA — não altera nada do jogo.
--
-- Depois de rodar, confira na lateral (Table Editor) se as tabelas
-- *_backup_v096 apareceram e têm linhas (profiles deve ter pelo menos 1).
--
-- Segurança: nenhuma policy é criada nestas tabelas → ninguém lê/escreve
-- nelas pela API (nem você) — só o SQL Editor as acessa.
-- =====================================================================

-- 1) Backup da tabela de perfis (onde o progresso vive hoje)
create table if not exists public.profiles_backup_v096 as
  select * from public.profiles;
  alter table public.profiles_backup_v096 enable row level security;
  revoke all on table public.profiles_backup_v096 from public, anon, authenticated;

-- 2) Backup de admins (minúscula, mas é a coroa do reino)
create table if not exists public.admins_backup_v096 as
  select * from public.admins;
  alter table public.admins_backup_v096 enable row level security;
  revoke all on table public.admins_backup_v096 from public, anon, authenticated;

-- 3) Confirmação (deve mostrar: profiles_backup_v096 | <número de contas>)
select 'profiles_backup_v096' as tabela, count(*) as linhas from public.profiles_backup_v096
union all
select 'admins_backup_v096', count(*) from public.admins_backup_v096;

-- ===== FIM DO BACKUP — agora rode o supabase-migration-v096.sql =====
