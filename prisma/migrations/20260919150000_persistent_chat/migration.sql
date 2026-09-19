-- Chat persistente (SQLite/testes).
-- Produção PostgreSQL recebe a migration equivalente via Supabase.
-- ChatMessage NÃO possui FKs por design: histórico só pode ser apagado pelo
-- comando administrativo explícito de limpeza do chat.

CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "senderPlayerId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "recipientPlayerId" TEXT,
    "recipientName" TEXT,
    "guildId" TEXT,
    "guildName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ChatMute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "mutedPlayerId" TEXT NOT NULL,
    "mutedPlayerName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ChatMessage_channel_createdAt_idx" ON "ChatMessage"("channel", "createdAt");
CREATE INDEX "ChatMessage_senderPlayerId_createdAt_idx" ON "ChatMessage"("senderPlayerId", "createdAt");
CREATE INDEX "ChatMessage_recipientPlayerId_createdAt_idx" ON "ChatMessage"("recipientPlayerId", "createdAt");
CREATE INDEX "ChatMessage_guildId_createdAt_idx" ON "ChatMessage"("guildId", "createdAt");
CREATE INDEX "ChatMute_playerId_idx" ON "ChatMute"("playerId");
CREATE UNIQUE INDEX "ChatMute_playerId_mutedPlayerId_key" ON "ChatMute"("playerId", "mutedPlayerId");
