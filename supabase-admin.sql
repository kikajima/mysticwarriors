-- =====================================================================
-- GUERREIROS MÍSTICOS — PAINEL DE ADMINISTRADOR (v0.9.1)
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

insert into public.admins (email)
values ('SEU_EMAIL_ADMIN_AQUI')
on conflict (email) do nothing;

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

-- ===== 3) Lista de jogadores (somente admin) =====
-- Retorna todos os usuários com o que há no perfil de cada um.

create or replace function public.admin_list_players()
returns table (
  user_id uuid,
  email text,
  nick text,
  nivel int,
  xp bigint,
  progresso jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email, p.nick, p.nivel, p.xp, p.progresso, u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_admin()
$$;

-- ===== 4) Ler o progresso salvo de um jogador (somente admin) =====

create or replace function public.admin_get_progress(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.progresso
  from public.profiles p
  where p.id = p_user_id
    and public.is_admin()
$$;

-- ===== 5) Gravar o progresso de um jogador (somente admin) =====
-- Substitui o snapshot jsonb e mantém nick/nivel/xp coerentes com o
-- personagem ativo do snapshot. Se ainda não existir linha no perfil,
-- tenta criar.

create or replace function public.admin_update_progress(p_user_id uuid, p_progresso jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_nick text;
  v_nivel int;
  v_xp bigint;
begin
  if not public.is_admin() then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  select c->>'name', (c->>'level')::int, (c->>'xp')::bigint
    into v_nick, v_nivel, v_xp
  from jsonb_array_elements(p_progresso->'characters') c
  where c->>'name' = p_progresso->>'activePlayerName'
  limit 1;

  update public.profiles p
  set progresso = p_progresso,
      nick = coalesce(v_nick, p.nick),
      nivel = coalesce(v_nivel, p.nivel),
      xp = coalesce(v_xp, p.xp)
  where p.id = p_user_id;

  if found then
    return true;
  end if;

  begin
    insert into public.profiles (id, nick, nivel, xp, progresso)
    values (p_user_id, coalesce(v_nick, 'guerreiro'), coalesce(v_nivel, 1), coalesce(v_xp, 0), p_progresso);
    return true;
  exception when others then
    return false;
  end;
end;
$$;

-- ===== 6) Permissões de execução =====
-- Usuários comuns PODEM chamar is_admin() (recebem "false" e nada mais).
-- As demais funções só servem para o admin — mas mantemos a execução
-- liberada para "authenticated" porque a verificação interna é quem
-- decide; anônimos (sem login) ficam bloqueados.

-- v0.9.1: remove a antiga admin_reset_progress, caso exista de um SQL
-- anterior (ela zerava o progresso salvo; o reset agora preserva os
-- personagens e passa pela admin_update_progress).
drop function if exists public.admin_reset_progress(uuid);

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_list_players() from public, anon;
revoke execute on function public.admin_get_progress(uuid) from public, anon;
revoke execute on function public.admin_update_progress(uuid, jsonb) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_players() to authenticated;
grant execute on function public.admin_get_progress(uuid) to authenticated;
grant execute on function public.admin_update_progress(uuid, jsonb) to authenticated;

-- ===== FIM — painel liberado para SEU_EMAIL_ADMIN_AQUI =====
