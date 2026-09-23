-- Stage 12 — servidor autoritativo também no espelho public.personagens.
-- Linhas antigas foram graváveis pelo navegador; portanto começam em
-- quarentena e só voltam ao ranking/restore depois de serem reescritas pelo
-- backend usando DATABASE_URL.

alter table public.personagens
  add column if not exists server_verified boolean not null default false;

-- Quarentena deliberada: não há como provar retrospectivamente quais
-- snapshots antigos foram produzidos pelo servidor e quais foram alterados
-- pelo dono via API do Supabase.
update public.personagens set server_verified = false;

-- O usuário continua podendo LER o próprio backup, mas gameplay é appendido
-- somente pelo backend. RLS deixa de conceder mutações ao papel authenticated.
drop policy if exists "personagens_insert_proprias" on public.personagens;
drop policy if exists "personagens_update_proprias" on public.personagens;
drop policy if exists "personagens_delete_proprias" on public.personagens;
revoke insert, update, delete on public.personagens from authenticated;
grant select on public.personagens to authenticated;

-- Ranking ignora qualquer snapshot que não tenha sido confirmado pelo backend.
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
    where p.server_verified = true
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

-- RPCs de admin são uma exceção explícita: is_admin() continua decidindo a
-- autorização, e qualquer gravação administrativa passa a marcar a linha
-- como confiável.
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

  insert into public.personagens
    (id, user_id, nome, raca, nivel, poder, vitorias, derrotas, ativo, estado, server_verified, atualizado_em)
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
    true,
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
    server_verified = true,
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
      server_verified = true,
      atualizado_em = now()
  where p.id = p_personagem_id;

  return found;
end;
$$;

revoke execute on function public.admin_upsert_personagem(jsonb) from anon, public;
revoke execute on function public.admin_update_personagem_estado(text, jsonb) from anon, public;
grant execute on function public.admin_upsert_personagem(jsonb) to authenticated;
grant execute on function public.admin_update_personagem_estado(text, jsonb) to authenticated;

-- O RPC de PvP antigo revelava snapshot interno para qualquer authenticated.
-- O backend Stage 12 lê o espelho por DATABASE_URL, então a superfície
-- pública deixa de existir.
do $$
begin
  if to_regprocedure('public.pvp_opponent(text)') is not null then
    execute 'revoke all on function public.pvp_opponent(text) from authenticated';
  end if;
  if to_regprocedure('private.pvp_opponent(text)') is not null then
    execute 'revoke all on function private.pvp_opponent(text) from authenticated';
  end if;
end $$;

-- Storage: metadado continua sendo só a primeira barreira; o backend também
-- baixa e decodifica os bytes reais antes de aceitar a URL.
drop policy if exists "avatar_upload_proprio" on storage.objects;
create policy "avatar_upload_proprio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || auth.uid()::text || '/avatar-[0-9]+[.](jpg|png|webp)$')
    and coalesce(metadata->>'mimetype', '') in ('image/jpeg', 'image/png', 'image/webp')
    and coalesce((metadata->>'size')::bigint, 0) <= 5242880
  );
