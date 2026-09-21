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

-- Relações criadas pelo modelo antigo eram unilaterais e não tiveram aceite.
-- Convertem-se em pedidos pendentes para exigir consentimento daqui em diante.
INSERT INTO game."ChatFriendRequest" (
  "id", "senderPlayerId", "senderPlayerName",
  "recipientPlayerId", "recipientPlayerName", "createdAt"
)
SELECT
  'legacy-' || f."id",
  f."playerId",
  COALESCE(p."name", f."playerId"),
  f."friendPlayerId",
  f."friendPlayerName",
  f."createdAt"
FROM game."ChatFriend" f
LEFT JOIN game."Player" p ON p."id" = f."playerId"
ON CONFLICT ("senderPlayerId", "recipientPlayerId") DO NOTHING;

DELETE FROM game."ChatFriend";
