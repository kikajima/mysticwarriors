CREATE TABLE "DragonBallPossession" (
    "star" INTEGER NOT NULL PRIMARY KEY,
    "playerId" TEXT,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DragonBallPossession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "DragonBallPossession_playerId_idx" ON "DragonBallPossession"("playerId");

INSERT INTO "DragonBallPossession" ("star") VALUES (1), (2), (3), (4), (5), (6), (7);