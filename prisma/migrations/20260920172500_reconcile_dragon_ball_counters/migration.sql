-- A posse global das Esferas é a fonte de verdade.
-- Reconciliamos o contador legado de Player com a tabela de posse.

UPDATE "Player"
SET "dragonBalls" = (
  SELECT COUNT(*)
  FROM "DragonBallPossession"
  WHERE "DragonBallPossession"."playerId" = "Player"."id"
)
WHERE "dragonBalls" <> (
  SELECT COUNT(*)
  FROM "DragonBallPossession"
  WHERE "DragonBallPossession"."playerId" = "Player"."id"
);
