-- CreateTable
CREATE TABLE "GuildRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "GuildRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildRoleAssignment" (
    "playerId" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    CONSTRAINT "GuildRoleAssignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "GuildRole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildInvitation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GuildInvitation_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildActionReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildActionReceipt_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Additive only: never rebuild or delete existing guilds.
ALTER TABLE "Guild" ADD COLUMN "motd" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Guild" ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Guild" ADD COLUMN "disbandedAt" DATETIME;

-- Preserve level and proportional progress inside the previous level.
-- Donation ledger and totalDonated remain byte-for-byte unchanged.
UPDATE "Guild" SET "xp" = CASE
WHEN "level" >= 10 THEN 1897000
ELSE
 CASE "level" WHEN 1 THEN 0 WHEN 2 THEN 8000 WHEN 3 THEN 22000 WHEN 4 THEN 47000 WHEN 5 THEN 92000 WHEN 6 THEN 172000 WHEN 7 THEN 317000 WHEN 8 THEN 577000 WHEN 9 THEN 1047000 END
 + CAST(MIN(0.999999, MAX(0.0, ("xp" - 500.0 * ("level"-1) * ("level"-1)) / (500.0 * (2*"level"-1)))) *
 CASE "level" WHEN 1 THEN 8000 WHEN 2 THEN 14000 WHEN 3 THEN 25000 WHEN 4 THEN 45000 WHEN 5 THEN 80000 WHEN 6 THEN 145000 WHEN 7 THEN 260000 WHEN 8 THEN 470000 WHEN 9 THEN 850000 END AS INTEGER)
END;

-- CreateIndex
CREATE UNIQUE INDEX "GuildRole_guildId_name_key" ON "GuildRole"("guildId", "name");

-- CreateIndex
CREATE INDEX "GuildInvitation_playerId_expiresAt_idx" ON "GuildInvitation"("playerId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GuildInvitation_guildId_playerId_key" ON "GuildInvitation"("guildId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildActionReceipt_playerId_requestId_key" ON "GuildActionReceipt"("playerId", "requestId");
