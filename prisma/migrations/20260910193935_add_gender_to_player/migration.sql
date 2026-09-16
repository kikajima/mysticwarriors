-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'male',
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
INSERT INTO "new_Player" ("accountId", "battlesLost", "battlesWon", "createdAt", "crystals", "defense", "dragonBalls", "energy", "guildDonated", "guildId", "hp", "id", "isBot", "items", "ki", "lastRegen", "lastZenkaiAt", "lastZenkaiOpponentId", "level", "loadout", "missionEndsAt", "missionId", "missionsCompleted", "missionsDone", "name", "pveBattleCount", "pveBattleDay", "pvpWins", "race", "speed", "stateVersion", "strategy", "strength", "techniques", "trainingsDone", "transformationId", "transformationsOwned", "updatedAt", "xp", "zeni", "zenkaiCount24h", "zenkaiWindowStart") SELECT "accountId", "battlesLost", "battlesWon", "createdAt", "crystals", "defense", "dragonBalls", "energy", "guildDonated", "guildId", "hp", "id", "isBot", "items", "ki", "lastRegen", "lastZenkaiAt", "lastZenkaiOpponentId", "level", "loadout", "missionEndsAt", "missionId", "missionsCompleted", "missionsDone", "name", "pveBattleCount", "pveBattleDay", "pvpWins", "race", "speed", "stateVersion", "strategy", "strength", "techniques", "trainingsDone", "transformationId", "transformationsOwned", "updatedAt", "xp", "zeni", "zenkaiCount24h", "zenkaiWindowStart" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE UNIQUE INDEX "Player_name_key" ON "Player"("name");
CREATE INDEX "Player_accountId_idx" ON "Player"("accountId");
CREATE INDEX "Player_guildId_idx" ON "Player"("guildId");
CREATE INDEX "Player_level_battlesWon_xp_idx" ON "Player"("level", "battlesWon", "xp");
CREATE INDEX "Player_isBot_idx" ON "Player"("isBot");
CREATE INDEX "Player_transformationId_idx" ON "Player"("transformationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
