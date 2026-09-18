-- Hardening: o sistema de guildas possui nível máximo 10.
-- Bancos legados podiam conter níveis acima do teto da regra antiga.
-- Não remove guildas nem histórico; apenas normaliza o estado derivado.
UPDATE "Guild"
SET "level" = 10,
    "xp" = 1897000
WHERE "level" > 10;

UPDATE "Guild"
SET "xp" = 1897000
WHERE "level" = 10 AND "xp" > 1897000;
