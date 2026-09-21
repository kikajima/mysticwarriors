-- Convites de amizade com aceite explícito (SQLite/testes).
CREATE TABLE "ChatFriendRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "senderPlayerId" TEXT NOT NULL,
  "senderPlayerName" TEXT NOT NULL,
  "recipientPlayerId" TEXT NOT NULL,
  "recipientPlayerName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ChatFriendRequest_senderPlayerId_recipientPlayerId_key"
  ON "ChatFriendRequest"("senderPlayerId", "recipientPlayerId");
CREATE INDEX "ChatFriendRequest_recipientPlayerId_createdAt_idx"
  ON "ChatFriendRequest"("recipientPlayerId", "createdAt");
CREATE INDEX "ChatFriendRequest_senderPlayerId_createdAt_idx"
  ON "ChatFriendRequest"("senderPlayerId", "createdAt");
