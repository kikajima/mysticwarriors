-- Snapshot global do chefe para sobreviver a recriacoes do Render gratuito.
create table if not exists public.world_boss_snapshots (
  id text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.world_boss_snapshots enable row level security;
grant select, insert, update on public.world_boss_snapshots to authenticated;

create or replace function public.get_world_boss_snapshot()
returns jsonb language sql security definer set search_path = public
as $$ select snapshot from public.world_boss_snapshots order by updated_at desc limit 1 $$;

create or replace function public.save_world_boss_snapshot(p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into public.world_boss_snapshots (id, snapshot, updated_at)
  values (p_snapshot->>'id', p_snapshot, now())
  on conflict (id) do update set snapshot = excluded.snapshot, updated_at = now();
  return true;
end;
$$;

revoke all on function public.get_world_boss_snapshot() from public;
grant execute on function public.get_world_boss_snapshot() to anon, authenticated;
revoke execute on function public.save_world_boss_snapshot(jsonb) from public, anon, authenticated;