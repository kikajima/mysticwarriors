-- =====================================================================
-- MYST KI WARRIORS — CORREÇÃO DO SAVE NA NUVEM (v0.9.3)
-- ---------------------------------------------------------------------
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
--
-- O PROBLEMA (confirmado por teste direto na API em 12/09/2026):
-- a tabela "profiles" foi criada SEM as permissões básicas (GRANT)
-- para o papel "authenticated" (usuários logados). O Postgres verifica
-- o GRANT ANTES das políticas de linha (RLS) — com o GRANT faltando,
-- toda leitura e toda escrita do jogo devolviam "permission denied
-- for table profiles" (HTTP 403) e o progresso nunca era salvo.
-- As CONTAS funcionavam porque o login é um serviço separado.
--
-- O que este bloco faz (nada além do necessário para o save funcionar):
--   1. Garante que as colunas do perfil existem (idempotente);
--   2. LIGA o RLS (segurança por linha — nunca desligamos);
--   3. Concede SELECT/INSERT/UPDATE a usuários logados ← A CORREÇÃO;
--   4. Cria as policies: cada conta só lê e grava A PRÓPRIA linha
--      ((select auth.uid()) = id);
--   5. Gatilho de segurança: a linha do perfil nasce junto com o
--      cadastro (com o nick escolhido), para nunca faltar.
--
-- Segurança mantida:
--   * Visitante sem login (anon) continua SEM acesso à tabela;
--   * Ninguém pode APAGAR linhas pela API (DELETE não é concedido);
--   * Cada conta só enxerga e edita o próprio progresso;
--   * A tabela "Jogadores" NÃO é tocada (o jogo não a usa).
--
-- Rodar de novo não estraga nada (é idempotente).
-- =====================================================================

-- ===== 1) Colunas do perfil (só cria se não existir) =====

alter table public.profiles add column if not exists nick text;
alter table public.profiles add column if not exists nivel int not null default 1;
alter table public.profiles add column if not exists xp bigint not null default 0;
alter table public.profiles add column if not exists progresso jsonb;

-- ===== 2) RLS LIGADO (nunca desligamos) =====

alter table public.profiles enable row level security;

-- ===== 3) A CORREÇÃO: permissões para usuários logados =====
-- Sem isto as policies abaixo nem chegavam a ser avaliadas.

grant select, insert, update on public.profiles to authenticated;

-- ===== 4) Policies: cada conta só acessa a própria linha =====

drop policy if exists "perfil_select_proprio" on public.profiles;
create policy "perfil_select_proprio" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "perfil_insert_proprio" on public.profiles;
create policy "perfil_insert_proprio" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "perfil_update_proprio" on public.profiles;
create policy "perfil_update_proprio" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ===== 5) Gatilho: perfil nasce junto com a conta =====
-- Camada extra de segurança — se o primeiro save do jogo falhar por
-- qualquer motivo, a linha do perfil já existe desde o cadastro, com o
-- nick que a pessoa escolheu. Nunca bloqueia um cadastro (qualquer
-- impedimento é ignorado; o jogo cria/atualiza a linha depois).

create or replace function public.criar_perfil_ao_cadastrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, nick, nivel, xp)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'nick', 'guerreiro'),
      1,
      0
    )
    on conflict (id) do nothing;
  exception when others then
    null; -- perfil já existe ou restrição diferente — o jogo cobre depois
  end;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_ao_cadastrar();

-- ===== FIM — o save na nuvem volta a funcionar =====
