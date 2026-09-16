-- CreateTable
CREATE TABLE "RequestDedup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestDedup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "usernameLower" TEXT,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "activePlayerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_activePlayerId_fkey" FOREIGN KEY ("activePlayerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("createdAt", "id", "isGuest", "passwordHash", "updatedAt", "username", "usernameLower") SELECT "createdAt", "id", "isGuest", "passwordHash", "updatedAt", "username", "usernameLower" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");
CREATE UNIQUE INDEX "Account_usernameLower_key" ON "Account"("usernameLower");
CREATE UNIQUE INDEX "Account_activePlayerId_key" ON "Account"("activePlayerId");
CREATE INDEX "Account_isGuest_idx" ON "Account"("isGuest");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RequestDedup_createdAt_idx" ON "RequestDedup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestDedup_playerId_requestId_key" ON "RequestDedup"("playerId", "requestId");
