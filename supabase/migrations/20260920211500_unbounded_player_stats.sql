-- Progressão sem teto artificial de atributos.
-- Mantemos valores inteiros pela lógica do jogo, mas DOUBLE PRECISION evita
-- o limite de INTEGER (2.147.483.647) em personagens de progressão longa.

ALTER TABLE game."Player"
  ALTER COLUMN "hp" TYPE DOUBLE PRECISION USING "hp"::double precision,
  ALTER COLUMN "strength" TYPE DOUBLE PRECISION USING "strength"::double precision,
  ALTER COLUMN "defense" TYPE DOUBLE PRECISION USING "defense"::double precision,
  ALTER COLUMN "speed" TYPE DOUBLE PRECISION USING "speed"::double precision,
  ALTER COLUMN "ki" TYPE DOUBLE PRECISION USING "ki"::double precision;
