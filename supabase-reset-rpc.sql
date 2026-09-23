-- =====================================================================
-- MYST KI WARRIORS — RPC admin_reset_cloud (v3 — corrige o erro 23502)
-- =====================================================================
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
-- É uma instalação ÚNICA (uma vez só) — depois disso, o botão "Reset
-- geral do servidor" do painel admin limpa SOZINHO o servidor E a nuvem.
--
-- ⚠️ CORREÇÃO v3 (diagnóstico v0.9.10.3): a coluna `progresso` de
-- `profiles` é NOT NULL nesta nuvem — a versão anterior gravava NULL e
-- detonava o erro 23502 ("null value in column progresso violates
-- not-null constraint") no meio da RPC, derrubando TODO o reset da
-- nuvem (era a causa do "HTTP 400 / RESET PARCIAL" do botão). Agora o
-- reset grava um SNAPSHOT VAZIO VÁLIDO no formato do contrato v3 do
-- jogo ({version:3, characters:[], cosmeticsOwned:[]}) — para o jogo é
-- idêntico a "sem progresso salvo" (ele só restaura quando existe ao
-- menos 1 personagem em characters[]), e a constraint NOT NULL fica
-- satisfeita. Rodar esta versão em cima da antiga é seguro (create or
-- replace).
--
-- O QUE ESTA RPC FAZ (tudo numa transação só, quando chamada pelo botão):
--   1. BACKUP da nuvem: copia `personagens` e `profiles` para
--      personagens_backup_reset / profiles_backup_reset (+ admins, por
--      precaução) — é o mesmo backup dos BLOCOS 1/2 manuais;
--   2. APAGA todas as linhas de `personagens` (o espelho de cada
--      personagem usado pelo cloud-restore e pelo ranking público);
--   3. LIMPA os dados de jogador dos `profiles` (substitui o progresso
--      legado por um snapshot vazio v3, nivel 1, xp 0) mantendo id/nick
--      (o login continua funcionando);
--   4. Devolve um relatório (JSON) com as contagens — o painel exibe.
--
-- SEGURANÇA (mesmo modelo das demais RPCs do painel):
--   * security definer + verificação is_admin() INTERNA — só a conta
--     administradora consegue executar; qualquer outra conta recebe
--     erro 42501 (Não autorizado);
--   * NENHUMA chave secreta/service_role — o jogo chama com a chave
--     publicável + o token do próprio admin;
--   * confirmação obrigatória: p_confirm = 'RESET' (o botão envia).
--
-- O QUE ELA NÃO TOCA:
--   * auth.users (contas e logins — ninguém re-cadastra);
--   * public.admins (acesso administrativo);
--   * ranking_nuvem(), políticas RLS e triggers (código de configuração);
--   * bucket de avatares do Storage (arquivos órfãos ficam, inofensivos).
--
-- RODAR DE NOVO este bloco é SEGURO (create or replace — não apaga
-- nada por si só; só re-instala a função). O backup da nuvem gerado a
-- cada uso SUBSTITUI o anterior (drop + recria) — mesmo comportamento
-- do BLOCO 1 manual.
-- =====================================================================

create or replace function public.admin_reset_cloud(p_confirm text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_apagados int;
  v_perfis   int;
begin
  -- só a conta administradora (mesma checagem das outras RPCs do painel)
  if not public.is_admin() then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  -- confirmação explícita (defesa em profundidade: a rota também valida)
  if coalesce(p_confirm, '') <> 'RESET' then
    raise exception 'Confirmação ausente — envie RESET para confirmar.' using errcode = '22023';
  end if;

  -- ===== 1) BACKUP da nuvem (substitui o anterior) =====
  drop table if exists public.personagens_backup_reset;
  create table public.personagens_backup_reset as select * from public.personagens;
  alter table public.personagens_backup_reset enable row level security;
  revoke all on table public.personagens_backup_reset from public, anon, authenticated;

  drop table if exists public.profiles_backup_reset;
  create table public.profiles_backup_reset as select * from public.profiles;
  alter table public.profiles_backup_reset enable row level security;
  revoke all on table public.profiles_backup_reset from public, anon, authenticated;

  drop table if exists public.admins_backup_reset;
  create table public.admins_backup_reset as select * from public.admins;
  alter table public.admins_backup_reset enable row level security;
  revoke all on table public.admins_backup_reset from public, anon, authenticated;

  -- ===== 2) WIPE da nuvem =====
  delete from public.personagens;
  get diagnostics v_apagados = row_count;

  -- Snapshot VAZIO no formato do contrato v3 (CLOUD_PROGRESS_VERSION).
  -- NUNCA usar NULL aqui: a coluna `progresso` é NOT NULL nesta nuvem
  -- (erro 23502 constatado no diagnóstico de 2026-09-13). Com
  -- characters = [] o jogo trata a conta como "sem save" — mesmo
  -- efeito de limpar, sem violar a constraint.
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
  get diagnostics v_perfis = row_count;

  -- ===== 3) RELATÓRIO (o painel exibe estas contagens) =====
  return jsonb_build_object(
    'ok', true,
    'personagens_apagados', v_apagados,
    'perfis_limpos', v_perfis,
    'backup_personagens', (select count(*) from public.personagens_backup_reset),
    'backup_perfis', (select count(*) from public.profiles_backup_reset),
    'resetado_em', now()
  );
end;
$$;

-- Permissões: só "authenticated" executa (a checagem interna is_admin()
-- decide de verdade; anônimos ficam bloqueados).
revoke execute on function public.admin_reset_cloud(text) from anon, public;
grant execute on function public.admin_reset_cloud(text) to authenticated;

-- ===== VERIFICAÇÃO DA INSTALAÇÃO =====
-- Deve devolver a definição da função (uma linha com a assinatura).
select proname, pg_get_function_identity_arguments(oid) as argumentos
from pg_proc
where proname = 'admin_reset_cloud' and pronamespace = 'public'::regnamespace;

-- ===== FIM — instalado! O botão do painel agora limpa a nuvem sozinho =====
