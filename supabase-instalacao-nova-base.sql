-- =====================================================================
-- GUERREIROS MÍSTICOS — INSTALAÇÃO COMPLETA NA NOVA BASE (2026)
-- =====================================================================
-- PROJETO ALVO: rugbhzcmxmtmoqoxrhki (base NOVA, separada do projeto
-- antigo a pedido do dono, para não misturar os dados).
--
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE (do projeto novo)
-- E CLIQUE EM "Run". UMA VEZ SÓ — depois disso o jogo está completo.
--
-- O QUE ESTE SCRIPT CRIA (do zero — a base nova está vazia):
--   1. Tabela `profiles`       — login/nick da conta (1 linha por conta);
--   2. Tabela `personagens`    — 1 linha POR personagem (snapshot v3
--      completo em `estado` + colunas espelhadas para o ranking);
--   3. Tabela `admins`         — acesso do painel (só o e-mail do dono);
--   4. RLS em tudo + policies  — cada usuário só toca nas PRÓPRIAS
--      linhas; anônimo só enxerga o ranking público;
--   5. Gatilhos: perfil nasce junto com o cadastro (auth.users) e
--      personagens sempre com atualizado_em fresco;
--   6. RPC ranking_nuvem v3    — ranking público calculado AO VIVO
--      (SÓ a versão 3-argumentos — sem a sobrecarga antiga que causava
--      ambiguidade PGRST203 no projeto velho);
--   7. RPCs do painel admin    — v0.9.1 (contas) + v0.9.6 (personagens),
--      todas com is_admin() interno;
--   8. RPC admin_reset_cloud v3 — o botão "Reset geral" limpa a nuvem
--      sozinho (grava snapshot vazio VÁLIDO — nunca NULL, nunca 23502);
--   9. Storage: bucket público "avatars" + policies (upload só na
--      própria pasta, só imagem, até 5 MB).
--
-- SEGURANÇA (mesmo modelo do projeto original):
--   * o jogo usa SOMENTE a chave publicável — nenhuma chave secreta
--     (service_role) existe no código;
--   * RLS ativo em todas as tabelas;
--   * nenhuma policy de DELETE para anon; personagens só podem ser
--     apagados pelo PRÓPRIO dono (logado);
--   * as RPCs admin verificam is_admin() INTERNAMENTE (security
--     definer) — qualquer outra conta recebe "Não autorizado".
--
-- Rodar de novo é seguro (idempotente — nada é duplicado nem apagado).
-- =====================================================================

-- =====================================================================
-- 1) TABELA `profiles` (a CONTA: só login/nick — nenhum valor de jogo)
-- =====================================================================
-- A coluna `progresso` é NOT NULL (mesma constraint da base antiga —
-- v0.9.10.4). Nasce com '{}' (o jogo trata como "sem save": só restaura
-- quando existe ao menos 1 personagem em characters[]).

create table if not exists public.profiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  nick      text,
  nivel     int   not null default 1,
  xp        bigint not null default 0,
  progresso jsonb not null default '{}'::jsonb
);

create index if not exists idx_profiles_nick on public.profiles (nick);

-- RLS: cada conta só lê e grava a PRÓPRIA linha; anon NÃO acessa.
alter table public.profiles enable row level security;

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

-- Permissões: sem DELETE pela API (o jogo nunca apaga perfis).
grant select, insert, update on public.profiles to authenticated;

-- Gatilho: a linha do perfil nasce junto com o cadastro (com o nick
-- escolhido). Nunca bloqueia um cadastro — qualquer impedimento é
-- ignorado; o jogo cria/atualiza a linha depois.
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

-- =====================================================================
-- 2) TABELA `personagens` (1 linha POR personagem — contrato v3)
-- =====================================================================

create table if not exists public.personagens (
  id            text primary key,             -- id do personagem no servidor do jogo
  user_id       uuid not null references auth.users(id) on delete cascade,
  nome          text not null default 'guerreiro',
  raca          text not null default 'saiyajin',
  nivel         int  not null default 1,
  poder         bigint not null default 0,
  vitorias      int  not null default 0,
  derrotas      int  not null default 0,
  ativo         boolean not null default false, -- personagem em uso pela conta
  estado        jsonb not null default '{}'::jsonb, -- snapshot completo (v3)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_personagens_user    on public.personagens (user_id);
create index if not exists idx_personagens_ranking on public.personagens (nivel desc, vitorias desc);
create index if not exists idx_personagens_nome    on public.personagens (nome);

-- RLS: cada usuário só toca nos PRÓPRIOS personagens.
alter table public.personagens enable row level security;

drop policy if exists "personagens_select_proprias" on public.personagens;
create policy "personagens_select_proprias"
  on public.personagens for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "personagens_insert_proprias" on public.personagens;
create policy "personagens_insert_proprias"
  on public.personagens for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "personagens_update_proprias" on public.personagens;
create policy "personagens_update_proprias"
  on public.personagens for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "personagens_delete_proprias" on public.personagens;
create policy "personagens_delete_proprias"
  on public.personagens for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.personagens to authenticated;

-- Gatilho: atualizado_em sempre fresco.
create or replace function public.tocar_personagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_tocar_personagem on public.personagens;
create trigger trg_tocar_personagem
  before update on public.personagens
  for each row execute function public.tocar_personagem();

-- =====================================================================
-- 3) TABELA `admins` + is_admin()
-- =====================================================================

create table if not exists public.admins (
  email text primary key
);

-- Configure o administrador manualmente após rodar este arquivo:
-- insert into public.admins (email) values ('SEU_EMAIL_REAL_AQUI')
-- on conflict (email) do nothing;
-- Não versione o e-mail real neste repositório.

alter table public.admins enable row level security;
-- RLS ligado e NENHUMA policy: ninguém lê nem escreve pela API — só as
-- funções internas (security definer) abaixo.

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

-- =====================================================================
-- 4) RPCs DO PAINEL — PARTE ANTIGA (contas / profiles)
-- =====================================================================

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

-- =====================================================================
-- 5) ranking_nuvem v3 — ranking público calculado AO VIVO
-- =====================================================================
-- SÓ a versão 3-argumentos (p_limite, p_offset, p_nome). A base nova
-- NÃO tem a sobrecarga antiga de 2 argumentos — sem ambiguidade.

drop function if exists public.ranking_nuvem(int, int); -- limpa sobrecarga antiga, se existir

create or replace function public.ranking_nuvem(
  p_limite int default 25,
  p_offset int default 0,
  p_nome text default null
)
returns table (
  posicao bigint,
  nome text,
  raca text,
  nivel int,
  vitorias int,
  derrotas int,
  poder bigint,
  total bigint,
  minha_posicao bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with dedup as (
    select distinct on (user_id, nome)
      p.*
    from public.personagens p
    order by user_id, nome, atualizado_em desc
  ),
  ranked as (
    select
      nome,
      raca,
      nivel,
      vitorias,
      derrotas,
      row_number() over (order by nivel desc, vitorias desc, (estado->>'xp')::bigint desc) as pos,
      poder
    from dedup
  )
  select
    r.pos,
    r.nome,
    r.raca,
    r.nivel,
    r.vitorias,
    r.derrotas,
    r.poder,
    (select count(*) from dedup) as total,
    (select r2.pos from ranked r2 where r2.nome = p_nome order by r2.pos limit 1) as minha_posicao
  from ranked r
  order by r.pos
  limit greatest(1, least(coalesce(p_limite, 25), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;

revoke execute on function public.ranking_nuvem(int, int, text) from public;
grant execute on function public.ranking_nuvem(int, int, text) to anon, authenticated;

-- =====================================================================
-- 6) RPCs DO PAINEL — v0.9.6 (personagens)
-- =====================================================================

create or replace function public.admin_list_personagens()
returns table (
  id text,
  user_id uuid,
  email text,
  nick text,
  nome text,
  raca text,
  nivel int,
  poder bigint,
  vitorias int,
  derrotas int,
  ativo boolean,
  estado jsonb,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.user_id, u.email, pf.nick, p.nome, p.raca, p.nivel, p.poder,
         p.vitorias, p.derrotas, p.ativo, p.estado, p.criado_em
  from public.personagens p
  join auth.users u on u.id = p.user_id
  left join public.profiles pf on pf.id = p.user_id
  where public.is_admin()
  order by p.nivel desc, p.vitorias desc, p.nome asc
$$;

create or replace function public.admin_get_personagem_estado(p_personagem_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select p.estado
  from public.personagens p
  where p.id = p_personagem_id
    and public.is_admin()
$$;

create or replace function public.admin_upsert_personagem(p_personagem jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if p_personagem->>'id' is null or p_personagem->>'user_id' is null then
    return false;
  end if;

  insert into public.personagens (id, user_id, nome, raca, nivel, poder, vitorias, derrotas, ativo, estado, atualizado_em)
  values (
    p_personagem->>'id',
    (p_personagem->>'user_id')::uuid,
    coalesce(p_personagem->>'nome', 'guerreiro'),
    coalesce(p_personagem->>'raca', 'saiyajin'),
    coalesce((p_personagem->>'nivel')::int, 1),
    coalesce((p_personagem->>'poder')::bigint, 0),
    coalesce((p_personagem->>'vitorias')::int, 0),
    coalesce((p_personagem->>'derrotas')::int, 0),
    coalesce((p_personagem->>'ativo')::boolean, false),
    coalesce(p_personagem->'estado', '{}'::jsonb),
    now()
  )
  on conflict (id) do update set
    nome = excluded.nome,
    raca = excluded.raca,
    nivel = excluded.nivel,
    poder = excluded.poder,
    vitorias = excluded.vitorias,
    derrotas = excluded.derrotas,
    ativo = excluded.ativo,
    estado = excluded.estado,
    atualizado_em = now();

  return true;
end;
$$;

create or replace function public.admin_update_personagem_estado(p_personagem_id text, p_estado jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  update public.personagens p
  set estado = p_estado,
      nome = coalesce(p_estado->>'name', p.nome),
      raca = coalesce(p_estado->>'race', p.raca),
      nivel = coalesce((p_estado->>'level')::int, p.nivel),
      vitorias = coalesce((p_estado->>'battlesWon')::int, p.vitorias),
      derrotas = coalesce((p_estado->>'battlesLost')::int, p.derrotas),
      poder = coalesce(
        round(
          coalesce((p_estado->>'level')::int, p.nivel) * 15
          + round(coalesce((p_estado->>'strength')::int, 0) * 2.2)
          + round(coalesce((p_estado->>'ki')::int, 0) * 2.4) * 0.9
          + round(coalesce((p_estado->>'defense')::int, 0) * 1.8)
          + round(coalesce((p_estado->>'defense')::int, 0) * 1.1 + coalesce((p_estado->>'ki')::int, 0) * 0.9) * 0.6
          + coalesce((p_estado->>'speed')::int, 0) * 2
        )::bigint,
        p.poder
      ),
      atualizado_em = now()
  where p.id = p_personagem_id;

  return found;
end;
$$;

-- Permissões: só "authenticated" executa (a verificação interna
-- is_admin() decide; anônimos ficam bloqueados).
revoke execute on function public.admin_list_personagens() from anon, public;
revoke execute on function public.admin_get_personagem_estado(text) from anon, public;
revoke execute on function public.admin_upsert_personagem(jsonb) from anon, public;
revoke execute on function public.admin_update_personagem_estado(text, jsonb) from anon, public;

grant execute on function public.admin_list_personagens() to authenticated;
grant execute on function public.admin_get_personagem_estado(text) to authenticated;
grant execute on function public.admin_upsert_personagem(jsonb) to authenticated;
grant execute on function public.admin_update_personagem_estado(text, jsonb) to authenticated;

-- =====================================================================
-- 7) RPC admin_reset_cloud (v3 — grava snapshot vazio VÁLIDO, nunca NULL)
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
  -- NUNCA usar NULL aqui: a coluna `progresso` é NOT NULL. Com
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

revoke execute on function public.admin_reset_cloud(text) from anon, public;
grant execute on function public.admin_reset_cloud(text) to authenticated;

-- Permissões das RPCs antigas (seção 4) + is_admin.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_list_players() from public, anon;
revoke execute on function public.admin_get_progress(uuid) from public, anon;
revoke execute on function public.admin_update_progress(uuid, jsonb) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_players() to authenticated;
grant execute on function public.admin_get_progress(uuid) to authenticated;
grant execute on function public.admin_update_progress(uuid, jsonb) to authenticated;

-- =====================================================================
-- 8) STORAGE — bucket público de avatares
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Leitura pública (a URL pública do avatar funciona para qualquer visitante)
drop policy if exists "avatar_leitura_publica" on storage.objects;
create policy "avatar_leitura_publica" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- Upload: apenas usuários logados, apenas na PRÓPRIA pasta
-- ("{userId}/avatar-..."), apenas imagens, até 5 MB.
drop policy if exists "avatar_upload_proprio" on storage.objects;
create policy "avatar_upload_proprio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '/%'
    and coalesce((metadata->>'mimetype') like 'image/%', false)
    and coalesce((metadata->>'size')::bigint, 0) <= 5242880
  );

-- (DELETE e UPDATE continuam SEM policy: jogadores não apagam nem
--  sobrescrevem arquivos pela API.)

-- =====================================================================
-- 9) CONFIRMAÇÃO FINAL — deve listar as 3 tabelas + as funções
-- =====================================================================

select 'profiles' as tabela, (select count(*) from public.profiles) as linhas
union all
select 'personagens', (select count(*) from public.personagens)
union all
select 'admins', (select count(*) from public.admins);

select proname, pg_get_function_identity_arguments(oid) as argumentos
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_admin', 'ranking_nuvem', 'admin_list_players', 'admin_get_progress',
                  'admin_update_progress', 'admin_list_personagens', 'admin_get_personagem_estado',
                  'admin_upsert_personagem', 'admin_update_personagem_estado', 'admin_reset_cloud')
order by proname;

-- ===== FIM — instalação completa na base nova! =====
-- Depois disto o jogo já pode: criar contas na nuvem, salvar personagens
-- por linha, ranking público ao vivo, painel admin e reset da nuvem.

revoke execute on function public.criar_perfil_ao_cadastrar() from public, anon, authenticated;

revoke execute on function public.tocar_personagem() from public, anon, authenticated;
