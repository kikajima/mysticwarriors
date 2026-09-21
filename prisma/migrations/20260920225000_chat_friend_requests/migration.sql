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

-- Relações criadas pelo modelo antigo eram unilaterais e não tiveram aceite.
-- Convertem-se em pedidos pendentes para exigir consentimento daqui em diante.
INSERT OR IGNORE INTO "ChatFriendRequest" (
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
FROM "ChatFriend" f
LEFT JOIN "Player" p ON p."id" = f."playerId";

DELETE FROM "ChatFriend";
