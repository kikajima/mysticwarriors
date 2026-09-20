-- Progressão perpétua: atributos deixam de ser INTEGER (Int32) e passam
-- a DOUBLE PRECISION. Os valores existentes são preservados exatamente.
alter table game."Player"
  alter column "strength" type double precision using "strength"::double precision,
  alter column "defense" type double precision using "defense"::double precision,
  alter column "speed" type double precision using "speed"::double precision,
  alter column "ki" type double precision using "ki"::double precision;
