-- Offline opponents share the same world. Read-only gameplay lookup.
-- Account credentials, email addresses and profiles never leave the database.
-- The private helper intentionally reads other warriors for PvP; table RLS stays owner-only.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.pvp_opponent(p_nome text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(p_nome) < 1 or length(p_nome) > 20 then return null; end if;
  select p.user_id into owner_id from public.personagens p where p.nome = p_nome limit 1;
  if owner_id is null then return null; end if;
  return jsonb_build_object(
    'user_id', owner_id,
    'personagens', (
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'ativo', p.ativo, 'atualizado_em', p.atualizado_em,
        'estado', (select jsonb_object_agg(e.key, e.value) from jsonb_each(p.estado) e
          where e.key = any(array[
            'id','name','race','avatarUrl','level','xp','zeni','crystals','hp','energy',
            'strength','defense','speed','ki','battlesWon','battlesLost','pvpWins',
            'trainingsDone','guildDonated','missionsDone','dragonBalls','items','techniques',
            'loadout','strategy','missionsCompleted','professions','transformationId',
            'transformationsOwned','cosmeticsEquipped','cosmeticsOwned','missionId',
            'missionEndsAt','lastRegen','lastRegenHp','quests','achievementsClaimed',
            'talents','miracleWins','davidWins','tournament','tournamentTitles','tournamentRoundWins'
          ]))
      ) order by p.criado_em) from public.personagens p where p.user_id = owner_id
    )
  );
end;
$$;
revoke all on function private.pvp_opponent(text) from public, anon;
grant execute on function private.pvp_opponent(text) to authenticated;

create or replace function public.pvp_opponent(p_nome text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.pvp_opponent(p_nome); $$;
revoke all on function public.pvp_opponent(text) from public, anon;
grant execute on function public.pvp_opponent(text) to authenticated;
