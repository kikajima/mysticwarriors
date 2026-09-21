-- Amigos e bloqueios do chat (SQLite/testes).
-- Relações sociais são mantidas sem FKs para acompanhar o modelo do chat:
-- personagens podem ser apagados/resetados sem impedir a limpeza do histórico.

CREATE TABLE "ChatFriend" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "friendPlayerId" TEXT NOT NULL,
  "friendPlayerName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ChatBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "blockedPlayerId" TEXT NOT NULL,
  "blockedPlayerName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ChatFriend_playerId_friendPlayerId_key" ON "ChatFriend"("playerId", "friendPlayerId");
CREATE INDEX "ChatFriend_playerId_createdAt_idx" ON "ChatFriend"("playerId", "createdAt");
CREATE UNIQUE INDEX "ChatBlock_playerId_blockedPlayerId_key" ON "ChatBlock"("playerId", "blockedPlayerId");
CREATE INDEX "ChatBlock_playerId_createdAt_idx" ON "ChatBlock"("playerId", "createdAt");
CREATE INDEX "ChatBlock_blockedPlayerId_idx" ON "ChatBlock"("blockedPlayerId");
