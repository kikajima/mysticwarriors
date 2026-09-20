-- A posse global das Esferas é a fonte de verdade.
-- O contador legado em Player é apenas um cache denormalizado para UI/quests.

update game."Player" p
set "dragonBalls" = (
  select count(*)::integer
  from game."DragonBallPossession" dbp
  where dbp."playerId" = p."id"
)
where p."dragonBalls" <> (
  select count(*)::integer
  from game."DragonBallPossession" dbp
  where dbp."playerId" = p."id"
);
