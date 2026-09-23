-- =====================================================================
-- MYST KI WARRIORS — PAINEL DE ADMINISTRADOR (v0.9.1)
-- ---------------------------------------------------------------------
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
--
-- O que ele faz:
--   1. Cria a tabela "admins" com APENAS o seu e-mail. RLS ligado e
--      NENHUMA política criada: nenhum usuário consegue ler nem escrever
--      nela pela API (nem você) — só as funções internas abaixo.
--   2. Cria a função is_admin(): responde se o usuário LOGADO é o admin.
--   3. Cria as funções de admin (security definer): listar jogadores e
--      ler/gravar o progresso de qualquer jogador.
--      TODAS verificam is_admin() primeiro — se não for você, retornam
--      erro sem fazer nada. Assim, mesmo alguém forjando chamadas é
--      bloqueado pelo servidor do Supabase.
--
-- IMPORTANTE (v0.9.1): o botão "Resetar progresso" do painel NÃO apaga
-- personagens — cada guerreiro volta ao estado inicial (nível 1), com
-- nome, raça e avatar preservados. Por isso este SQL não tem mais a
-- função admin_reset_progress: o reset passa pela admin_update_progress.
--
-- Segurança: o jogo usa SOMENTE a chave publicável; nenhuma chave
-- secreta (service_role) existe no código.
--
-- Rode este bloco UMA vez. Rodar de novo não estraga nada (é idempotente).
-- =====================================================================

-- ===== 1) Tabela de administradores (só o seu e-mail) =====

create table if not exists public.admins (
  email text primary key
);

-- Configure o administrador manualmente após rodar este arquivo:
-- insert into public.admins (email) values ('SEU_EMAIL_REAL_AQUI')
-- on conflict (email) do nothing;
-- Não versione o e-mail real neste repositório.

alter table public.admins enable row level security;

-- Nenhuma política é criada: com RLS ligado e sem políticas, nenhum
-- papel (anon/authenticated) pode ler ou modificar a tabela pela API.

-- ===== 2) is_admin(): o usuário logado (auth.uid()) é o admin? =====

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admins a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid()
  );
$$;

-- ===== 3) RPCs legadas de conta — aposentadas na Etapa 13 =====
-- O painel atual opera por PERSONAGEM. Estas RPCs antigas não são mais
-- chamadas pelo código e são removidas para reduzir a superfície exposta.

drop function if exists public.admin_list_players();
drop function if exists public.admin_get_progress(uuid);
drop function if exists public.admin_update_progress(uuid, jsonb);
drop function if exists public.admin_reset_progress(uuid);

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ===== FIM — painel liberado para SEU_EMAIL_ADMIN_AQUI =====
