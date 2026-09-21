-- Amigos e bloqueios do chat no PostgreSQL autoritativo.
-- Sem FKs, seguindo o desenho do chat persistente; reset geral limpa estas
-- relações sociais explicitamente.

CREATE TABLE IF NOT EXISTS game."ChatFriend" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "friendPlayerId" TEXT NOT NULL,
  "friendPlayerName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game."ChatBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "blockedPlayerId" TEXT NOT NULL,
  "blockedPlayerName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatFriend_playerId_friendPlayerId_key"
  ON game."ChatFriend" ("playerId", "friendPlayerId");
CREATE INDEX IF NOT EXISTS "ChatFriend_playerId_createdAt_idx"
  ON game."ChatFriend" ("playerId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatBlock_playerId_blockedPlayerId_key"
  ON game."ChatBlock" ("playerId", "blockedPlayerId");
CREATE INDEX IF NOT EXISTS "ChatBlock_playerId_createdAt_idx"
  ON game."ChatBlock" ("playerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatBlock_blockedPlayerId_idx"
  ON game."ChatBlock" ("blockedPlayerId");
