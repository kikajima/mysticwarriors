-- Cada estrela existe uma única vez no mundo.
create table if not exists game."DragonBallPossession" (
  "star" integer primary key,
  "playerId" text references game."Player"("id") on delete set null,
  "acquiredAt" timestamptz(3) not null default current_timestamp
);
create index if not exists "DragonBallPossession_playerId_idx"
  on game."DragonBallPossession"("playerId");

insert into game."DragonBallPossession" ("star")
select series
from generate_series(1, 7) as series
on conflict ("star") do nothing;

-- Migra o contador legado sem inventar uma oitava esfera: os personagens
-- são processados numa ordem estável e recebem as menores estrelas livres.
do $$
declare
  current_player record;
  next_star integer;
  amount integer;
begin
  for current_player in
    select "id", greatest(0, least(7, "dragonBalls")) as amount
    from game."Player"
    where "dragonBalls" > 0
    order by "updatedAt", "id"
  loop
    amount := current_player.amount;
    while amount > 0 loop
      select "star" into next_star
      from game."DragonBallPossession"
      where "playerId" is null
      order by "star"
      limit 1;
      exit when next_star is null;
      update game."DragonBallPossession"
      set "playerId" = current_player."id", "acquiredAt" = current_timestamp
      where "star" = next_star and "playerId" is null;
      amount := amount - 1;
    end loop;
  end loop;
end $$;