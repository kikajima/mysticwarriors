-- Convites de amizade com aceite explícito no PostgreSQL autoritativo.
CREATE TABLE IF NOT EXISTS game."ChatFriendRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "senderPlayerId" TEXT NOT NULL,
  "senderPlayerName" TEXT NOT NULL,
  "recipientPlayerId" TEXT NOT NULL,
  "recipientPlayerName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatFriendRequest_senderPlayerId_recipientPlayerId_key"
  ON game."ChatFriendRequest" ("senderPlayerId", "recipientPlayerId");
CREATE INDEX IF NOT EXISTS "ChatFriendRequest_recipientPlayerId_createdAt_idx"
  ON game."ChatFriendRequest" ("recipientPlayerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatFriendRequest_senderPlayerId_createdAt_idx"
  ON game."ChatFriendRequest" ("senderPlayerId", "createdAt");
