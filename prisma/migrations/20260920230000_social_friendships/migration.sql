-- Amizades e bloqueios sociais integrados ao chat.
CREATE TABLE "Friendship" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerAId" TEXT NOT NULL,
  "playerBId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "acceptedAt" DATETIME,
  CONSTRAINT "Friendship_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Friendship_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Friendship_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Friendship_playerAId_playerBId_key" ON "Friendship"("playerAId","playerBId");
CREATE INDEX "Friendship_playerAId_status_idx" ON "Friendship"("playerAId","status");
CREATE INDEX "Friendship_playerBId_status_idx" ON "Friendship"("playerBId","status");
CREATE INDEX "Friendship_requestedById_status_idx" ON "Friendship"("requestedById","status");

CREATE TABLE "PlayerBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "blockedPlayerId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerBlock_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerBlock_blockedPlayerId_fkey" FOREIGN KEY ("blockedPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlayerBlock_playerId_blockedPlayerId_key" ON "PlayerBlock"("playerId","blockedPlayerId");
CREATE INDEX "PlayerBlock_playerId_createdAt_idx" ON "PlayerBlock"("playerId","createdAt");
CREATE INDEX "PlayerBlock_blockedPlayerId_idx" ON "PlayerBlock"("blockedPlayerId");
