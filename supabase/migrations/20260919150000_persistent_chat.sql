-- Persistent in-game chat for the authoritative PostgreSQL database.
-- ChatMessage intentionally has no foreign keys: chat history must survive
-- character deletion, guild dissolution, server reset and deploys. Only the
-- explicit admin chat-clear command deletes messages.

CREATE TABLE IF NOT EXISTS game."ChatMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channel" TEXT NOT NULL,
  "senderPlayerId" TEXT NOT NULL,
  "senderName" TEXT NOT NULL,
  "recipientPlayerId" TEXT,
  "recipientName" TEXT,
  "guildId" TEXT,
  "guildName" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game."ChatMute" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "mutedPlayerId" TEXT NOT NULL,
  "mutedPlayerName" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ChatMessage_channel_createdAt_idx"
  ON game."ChatMessage" ("channel", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_senderPlayerId_createdAt_idx"
  ON game."ChatMessage" ("senderPlayerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_recipientPlayerId_createdAt_idx"
  ON game."ChatMessage" ("recipientPlayerId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_guildId_createdAt_idx"
  ON game."ChatMessage" ("guildId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatMute_playerId_idx"
  ON game."ChatMute" ("playerId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChatMute_playerId_mutedPlayerId_key"
  ON game."ChatMute" ("playerId", "mutedPlayerId");
