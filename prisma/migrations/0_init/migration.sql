-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "usernameLower" TEXT,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "userAgent" TEXT,
    CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "leaderId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "totalDonated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "zeni" INTEGER NOT NULL DEFAULT 500,
    "crystals" INTEGER NOT NULL DEFAULT 0,
    "hp" INTEGER NOT NULL DEFAULT 100,
    "strength" INTEGER NOT NULL DEFAULT 10,
    "defense" INTEGER NOT NULL DEFAULT 10,
    "speed" INTEGER NOT NULL DEFAULT 10,
    "ki" INTEGER NOT NULL DEFAULT 10,
    "energy" INTEGER NOT NULL DEFAULT 100,
    "battlesWon" INTEGER NOT NULL DEFAULT 0,
    "battlesLost" INTEGER NOT NULL DEFAULT 0,
    "pvpWins" INTEGER NOT NULL DEFAULT 0,
    "trainingsDone" INTEGER NOT NULL DEFAULT 0,
    "guildDonated" INTEGER NOT NULL DEFAULT 0,
    "missionsDone" INTEGER NOT NULL DEFAULT 0,
    "dragonBalls" INTEGER NOT NULL DEFAULT 0,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "items" TEXT NOT NULL DEFAULT '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
    "techniques" TEXT NOT NULL DEFAULT '[]',
    "loadout" TEXT NOT NULL DEFAULT '{"1":null,"2":null,"3":null,"S":null}',
    "strategy" TEXT NOT NULL DEFAULT 'balanced',
    "missionId" TEXT,
    "missionEndsAt" DATETIME,
    "missionsCompleted" TEXT NOT NULL DEFAULT '[]',
    "transformationId" TEXT,
    "transformationsOwned" TEXT NOT NULL DEFAULT '[]',
    "lastZenkaiAt" DATETIME,
    "zenkaiWindowStart" DATETIME,
    "zenkaiCount24h" INTEGER NOT NULL DEFAULT 0,
    "lastZenkaiOpponentId" TEXT,
    "pveBattleDay" TEXT,
    "pveBattleCount" INTEGER NOT NULL DEFAULT 0,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "lastRegen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountId" TEXT,
    "guildId" TEXT,
    CONSTRAINT "Player_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Player_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT,
    "playerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "metadata" TEXT,
    "externalPaymentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WalletTransaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "rewardZeni" INTEGER NOT NULL DEFAULT 0,
    "rewardXp" INTEGER NOT NULL DEFAULT 0,
    "rewardCrystals" INTEGER NOT NULL DEFAULT 0,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AchievementState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "unlockedAt" DATETIME,
    "claimedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AchievementState_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldBoss" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "maxHp" INTEGER NOT NULL,
    "currentHp" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 50,
    "strength" INTEGER NOT NULL DEFAULT 300,
    "defense" INTEGER NOT NULL DEFAULT 200,
    "speed" INTEGER NOT NULL DEFAULT 150,
    "ki" INTEGER NOT NULL DEFAULT 280,
    "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "zeniReward" INTEGER NOT NULL DEFAULT 0,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "crystalReward" INTEGER NOT NULL DEFAULT 0,
    "defeatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WorldBossDamage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bossId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "damage" INTEGER NOT NULL DEFAULT 0,
    "attacks" INTEGER NOT NULL DEFAULT 0,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "lastAttackedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldBossDamage_bossId_fkey" FOREIGN KEY ("bossId") REFERENCES "WorldBoss" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorldBossDamage_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT 1,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SeasonRankEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SeasonRankEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeasonRankEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildDonation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuildDonation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'crystal',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "externalPaymentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Purchase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CosmeticOwned" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "cosmetic" TEXT NOT NULL,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CosmeticOwned_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "playerId" TEXT,
    "accountId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Account_usernameLower_key" ON "Account"("usernameLower");

-- CreateIndex
CREATE INDEX "Account_isGuest_idx" ON "Account"("isGuest");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_name_key" ON "Guild"("name");

-- CreateIndex
CREATE INDEX "Guild_level_idx" ON "Guild"("level");

-- CreateIndex
CREATE UNIQUE INDEX "Player_name_key" ON "Player"("name");

-- CreateIndex
CREATE INDEX "Player_accountId_idx" ON "Player"("accountId");

-- CreateIndex
CREATE INDEX "Player_guildId_idx" ON "Player"("guildId");

-- CreateIndex
CREATE INDEX "Player_level_battlesWon_xp_idx" ON "Player"("level", "battlesWon", "xp");

-- CreateIndex
CREATE INDEX "Player_isBot_idx" ON "Player"("isBot");

-- CreateIndex
CREATE INDEX "Player_transformationId_idx" ON "Player"("transformationId");

-- CreateIndex
CREATE INDEX "WalletTransaction_playerId_createdAt_idx" ON "WalletTransaction"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_source_idx" ON "WalletTransaction"("source");

-- CreateIndex
CREATE INDEX "WalletTransaction_accountId_idx" ON "WalletTransaction"("accountId");

-- CreateIndex
CREATE INDEX "QuestProgress_playerId_period_idx" ON "QuestProgress"("playerId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "QuestProgress_playerId_questId_period_key" ON "QuestProgress"("playerId", "questId", "period");

-- CreateIndex
CREATE INDEX "AchievementState_playerId_idx" ON "AchievementState"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementState_playerId_achievementId_key" ON "AchievementState"("playerId", "achievementId");

-- CreateIndex
CREATE INDEX "WorldBoss_status_idx" ON "WorldBoss"("status");

-- CreateIndex
CREATE INDEX "WorldBossDamage_bossId_damage_idx" ON "WorldBossDamage"("bossId", "damage");

-- CreateIndex
CREATE UNIQUE INDEX "WorldBossDamage_bossId_playerId_key" ON "WorldBossDamage"("bossId", "playerId");

-- CreateIndex
CREATE INDEX "Season_status_idx" ON "Season"("status");

-- CreateIndex
CREATE INDEX "SeasonRankEntry_seasonId_points_idx" ON "SeasonRankEntry"("seasonId", "points");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonRankEntry_seasonId_playerId_key" ON "SeasonRankEntry"("seasonId", "playerId");

-- CreateIndex
CREATE INDEX "GuildDonation_guildId_idx" ON "GuildDonation"("guildId");

-- CreateIndex
CREATE INDEX "GuildDonation_playerId_idx" ON "GuildDonation"("playerId");

-- CreateIndex
CREATE INDEX "Purchase_accountId_idx" ON "Purchase"("accountId");

-- CreateIndex
CREATE INDEX "Purchase_product_idx" ON "Purchase"("product");

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticOwned_accountId_cosmetic_key" ON "CosmeticOwned"("accountId", "cosmetic");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

