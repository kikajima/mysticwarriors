-- =====================================================================
-- MYST KI WARRIORS — MIGRAÇÃO v0.9.6 (corrigida em v0.9.6.1): SEPARAR PERSONAGEM DE CONTA
-- ---------------------------------------------------------------------
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
-- RODE DEPOIS DO supabase-backup-v096.sql.
--
-- O que muda:
--   1. Nova tabela `personagens`: UMA LINHA POR PERSONAGEM (id, dono,
--      estado completo em jsonb + colunas espelhadas para o ranking).
--      A CONTA (profiles) fica apenas com o login — nenhum valor de jogo
--      pertence a ela;
--   2. MIGRAÇÃO DOS DADOS EXISTENTES (idempotente): cada personagem que
--      hoje vive dentro de profiles.progresso->characters vira UMA linha
--      de `personagens`. Regra do dono: ninguém perde nada — o estado
--      compartilhado é DUPLICADO para cada personagem (ex.: conta com
--      500 zenni e 2 personagens → cada um fica com 500). Rodar duas
--      vezes não duplica nada (on conflict do nothing + id estável);
--   3. RLS: cada usuário só acessa os PRÓPRIOS personagens (user_id =
--      auth.uid()); o jogo lê e grava por lá com a sessão do jogador;
--   4. ranking_nuvem v3: lê a tabela `personagens` direto (mais rápido
--      do que abrir o jsonb de todo mundo) — mesma saída de sempre;
--   5. RPCs do painel admin AGORA SOBRE PERSONAGENS (is_admin() segue
--      valendo em todas; quem não é admin não vê nem altera nada).
--
-- Segurança: só a chave publicável é usada pelo jogo; RLS ativo em tudo.
--
-- v0.9.6.1 — CORREÇÃO DE BUG: a primeira versão falhava com
--   "null value in column estado" (erro 23502) para personagens salvos no
--   formato antigo (sem lista própria de cosméticos — o caso de TODO
--   personagem salvo antes da v0.9.6). Causa: um coalesce enganoso no
--   bloco cx da seção 3 (detalhe no comentário ali).
--   Se a versão antiga deu erro no seu banco: NENHUMA linha de personagem
--   foi criada pela metade — a etapa que popula a tabela falhou inteira,
--   e este bloco corrigido pode ser rodado POR CIMA (foi escrito para
--   re-rodar sem duplicar nada). Não é preciso rodar o backup de novo.
-- =====================================================================

-- ===== 1) Tabela de personagens =====

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

-- ===== 2) RLS: cada usuário só toca nos PRÓPRIOS personagens =====

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

-- acesso via API para o papel autenticado (RLS acima decide o resto)
grant select, insert, update, delete on public.personagens to authenticated;

-- ===== 3) MIGRAÇÃO: personagens de profiles.progresso → linhas =====
-- Idempotente:
--  * personagem com `id` no snapshot → usa esse id;
--  * sem id (formato antigo) → id ESTÁVEL derivado (mig-<md5 dono|nome>):
--    rodar de novo acha o MESMO id e não duplica;
--  * on conflict (id) do nothing → segunda execução não cria nada.
-- Estado compartilhado DUPLICADO para cada personagem da conta:
-- cosméticos da conta entram na lista DE CADA personagem (ninguém perde).
-- Nota: o filtro do jsonb fica numa SUBQUERY — perfis com `characters`
-- corrompido (não-array) são descartados ANTES de o Postgres tentar abrir
-- o array (jsonb_array_elements em escalar lançaria erro e travaria tudo).

insert into public.personagens (id, user_id, nome, raca, nivel, poder, vitorias, derrotas, ativo, estado, criado_em, atualizado_em)
select
  coalesce(
    nullif(ch.ch_val->>'id', ''),
    'mig-' || md5(pf.id::text || '|' || coalesce(nullif(ch.ch_val->>'name', ''), 'guerreiro'))
  ) as personagem_id,
  pf.id as user_id,
  coalesce(nullif(ch.ch_val->>'name', ''), 'guerreiro') as nome,
  coalesce(nullif(ch.ch_val->>'race', ''), 'saiyajin') as raca,
  coalesce((ch.ch_val->>'level')::int, 1) as nivel,
  coalesce(
    round(
      coalesce((ch.ch_val->>'level')::int, 1) * 15
      + round(coalesce((ch.ch_val->>'strength')::int, 10) * 2.2)
      + round(coalesce((ch.ch_val->>'ki')::int, 10) * 2.4) * 0.9
      + round(coalesce((ch.ch_val->>'defense')::int, 10) * 1.8)
      + round(coalesce((ch.ch_val->>'defense')::int, 10) * 1.1 + coalesce((ch.ch_val->>'ki')::int, 10) * 0.9) * 0.6
      + coalesce((ch.ch_val->>'speed')::int, 10) * 2
    )::bigint,
    0
  ) as poder,
  coalesce((ch.ch_val->>'battlesWon')::int, 0) as vitorias,
  coalesce((ch.ch_val->>'battlesLost')::int, 0) as derrotas,
  coalesce((ch.ch_val->>'name') = pf.progresso->>'activePlayerName', false) as ativo,
  -- estado = o personagem + cosméticos da conta duplicados para ELE.
  -- cx pré-computa as DUAS listas já GARANTIDAS como array (o operador
  -- AND do SQL não garante curto-circuito — jsonb_array_length em valor
  -- não-array lançaria erro e travaria a migração inteira).
  -- v0.9.6.1: COALESCE externo = rede de segurança — a coluna NUNCA
  -- recebe nulo, venha o que vier (ver correção no bloco cx abaixo).
  coalesce(
    jsonb_set(
      ch.ch_val,
      '{cosmeticsOwned}',
      case
        when jsonb_array_length(cx.conta_lista) > 0 and jsonb_array_length(cx.proprio_lista) = 0
          then cx.conta_lista
        else cx.proprio_lista
      end
    ),
    ch.ch_val,
    '{}'::jsonb
  ) as estado,
  -- criado_em da CONTA (auth.users sempre tem) + 1s por personagem do
  -- snapshot: preserva a ordem original da lista ao ordenar por criado_em
  coalesce(u.created_at, now()) + (ch.ch_idx * interval '1 second') as criado_em,
  now() as atualizado_em
from (
  select pf.id, pf.progresso
  from public.profiles pf
  where pf.progresso is not null
    and jsonb_typeof(pf.progresso->'characters') = 'array'
) pf
join auth.users u on u.id = pf.id
cross join lateral jsonb_array_elements(pf.progresso->'characters') with ordinality as ch(ch_val, ch_idx)
cross join lateral (
  -- v0.9.6.1 — CORREÇÃO DO NULL: o coalesce foi REMOVIDO do jsonb_typeof.
  -- Motivo: com a chave ausente (TODO personagem salvo no formato antigo),
  -- `x -> 'cosmeticsOwned'` é NULL em SQL; o coalesce virava '[]' SÓ para
  -- o teste jsonb_typeof passar, mas o THEN devolvia a expressão ORIGINAL
  -- (ainda NULL) — a lista saía nula, o jsonb_set devolvia NULL e a coluna
  -- `estado` (not null) rejeitava a linha: erro 23502. Sem o coalesce,
  -- jsonb_typeof(NULL) é NULL, o teste '= array' não passa e o ELSE entrega
  -- '[]' — sempre um array de verdade, nunca nulo.
  select
    case when jsonb_typeof(pf.progresso->'cosmeticsOwned') = 'array'
         then pf.progresso->'cosmeticsOwned' else '[]'::jsonb
    end as conta_lista,
    case when jsonb_typeof(ch.ch_val->'cosmeticsOwned') = 'array'
         then ch.ch_val->'cosmeticsOwned' else '[]'::jsonb
    end as proprio_lista
) cx
-- v0.9.6.1: elementos lixo do array (null, string, número) não são
-- personagens — descartados ANTES de qualquer jsonb_set
where jsonb_typeof(ch.ch_val) = 'object'
on conflict (id) do nothing;

-- ===== 4) ranking_nuvem v3 — lê a tabela personagens =====
-- Mesma assinatura e mesma saída de sempre (posição, nome, raça, nível,
-- vitórias, derrotas, poder, total, minha_posicao). Nenhum e-mail, nenhum
-- identificador interno. Deduplica por (dono, nome) para a janela de
-- transição em que uma conta pode ter linha migrada E linha do jogo.

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

-- ===== 5) RPCs do painel admin — AGORA SOBRE PERSONAGENS =====
-- Todas verificam is_admin() (security definer) — a regra anterior vale
-- igual: quem não é o admin não vê nem altera nada; o painel continua
-- INEXISTENTE para qualquer outra conta.

-- 5a) Lista de personagens (com o e-mail da conta dona — só informação)
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

-- 5b) Estado de UM personagem
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

-- 5c) Upsert de UMA linha completa (espelho do servidor do jogo)
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

-- 5d) Substitui o estado de um personagem (ações em quem só existe na
--     nuvem) — reespelha as colunas de ranking a partir do novo estado
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

-- Permissões: só "authenticated" executa (a verificação interna is_admin()
-- decide; anônimos ficam bloqueados).
revoke execute on function public.admin_list_personagens() from anon, public;
revoke execute on function public.admin_get_personagem_estado(text) from anon, public;
revoke execute on function public.admin_upsert_personagem(jsonb) from anon, public;
revoke execute on function public.admin_update_personagem_estado(text, jsonb) from anon, public;

grant execute on function public.admin_list_personagens() to authenticated;
grant execute on function public.admin_get_personagem_estado(text) to authenticated;
grant execute on function public.admin_upsert_personagem(jsonb) to authenticated;
grant execute on function public.admin_update_personagem_estado(text, jsonb) to authenticated;

-- ===== 6) Gatilho: atualizado_em sempre fresco =====

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

-- ===== 7) Confirmação final =====
-- Deve mostrar uma linha por personagem existente (nome, nível, dono).
select p.nome, p.nivel, p.poder, u.email as dono
from public.personagens p
join auth.users u on u.id = p.user_id
order by p.nivel desc, p.nome asc
limit 50;

-- ===== FIM — v0.9.6: personagem separado de conta =====

revoke execute on function public.tocar_personagem() from public, anon, authenticated;
