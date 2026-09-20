-- Progressão perpétua (SQLite legado/testes).
-- SQLite usa tipagem dinâmica: colunas INTEGER aceitam valores REAL sem rebuild.
-- O Prisma de testes passa a mapear os quatro atributos como Float; nenhuma
-- reconstrução destrutiva da tabela Player é necessária.
SELECT 1;
