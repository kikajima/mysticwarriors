-- =====================================================================
-- GUERREIROS MÍSTICOS — LIMPEZA MANUAL DA NUVEM (v0.9.10.2)
-- =====================================================================
-- QUANDO USAR ESTE BLOCO: quando o "Reset geral do servidor" já rodou
-- (o SERVIDOR está limpo), mas a NUVEM ainda tem personagens antigos
-- aparecendo no ranking (ex.: "Reset parcial"). Isto apaga os espelhos
-- antigos da nuvem SEM tocar no servidor — personagens criados DEPOIS
-- do reset continuam vivos no servidor e re-sincronizam sozinhos.
--
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
-- Pode rodar mais de uma vez com segurança (idempotente).
--
-- O QUE FAZ:
--   1. BACKUP: copia `personagens` e `profiles` para
--      personagens_backup_reset / profiles_backup_reset;
--   2. APAGA todas as linhas de `personagens` (o espelho que alimenta o
--      ranking da nuvem e o cloud-restore);
--   3. LIMPA progresso/nível/xp dos `profiles` (mantém id/nick — o
--      login continua funcionando para todo mundo).
--
-- NÃO TOCA: auth.users (contas), public.admins, RLS, ranking_nuvem().
--
-- DEPOIS DISTO: instale a RPC admin_reset_cloud
-- (supabase-reset-rpc.sql) para que o próximo "Reset geral do servidor"
-- limpe servidor E nuvem num clique só, sem SQL manual.
-- =====================================================================

-- ===== 1) BACKUP (substitui o anterior) =====
drop table if exists public.personagens_backup_reset;
create table public.personagens_backup_reset as select * from public.personagens;
  alter table public.personagens_backup_reset enable row level security;
  revoke all on table public.personagens_backup_reset from public, anon, authenticated;

drop table if exists public.profiles_backup_reset;
create table public.profiles_backup_reset as select * from public.profiles;
  alter table public.profiles_backup_reset enable row level security;
  revoke all on table public.profiles_backup_reset from public, anon, authenticated;

-- ===== 2) LIMPEZA =====
delete from public.personagens;

-- Snapshot VAZIO v3 (NUNCA null — a coluna progresso é NOT NULL nesta
-- nuvem, erro 23502 constatado no diagnóstico de 2026-09-13). Com
-- characters:[] o jogo trata a conta como "sem save" — mesmo efeito.
update public.profiles
   set progresso = jsonb_build_object(
         'version', 3,
         'savedAt', concat(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS'), 'Z'),
         'activePlayerName', null,
         'characters', '[]'::jsonb,
         'cosmeticsOwned', '[]'::jsonb
       ),
       nivel = 1,
       xp = 0;

-- ===== 3) VERIFICAÇÃO (esperado: 0 e 0) =====
select
  (select count(*) from public.personagens) as personagens_restantes,
  (select count(*) from public.profiles
     where jsonb_typeof(progresso->'characters') = 'array'
       and jsonb_array_length(progresso->'characters') > 0) as perfis_com_progresso,
  (select count(*) from public.personagens_backup_reset) as linhas_no_backup,
  (select count(*) from auth.users) as contas_de_login_intactas;

-- ===== FIM — ranking da nuvem limpo =====
-- Os personagens vivos no servidor re-aparecem na nuvem sozinhos quando
-- os donos jogarem (auto-save a cada ação importante).
