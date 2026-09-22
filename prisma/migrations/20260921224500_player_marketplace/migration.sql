-- Mercado P2P com escrow de materiais/equipamentos (SQLite/testes).
CREATE TABLE "MarketListing" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "itemIcon" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "quantityRemaining" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "soldAt" DATETIME,
  "cancelledAt" DATETIME,
  CONSTRAINT "MarketListing_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketTrade" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "listingId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "totalPrice" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketTrade_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "MarketListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketTrade_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketTrade_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MarketListing_status_createdAt_idx"
  ON "MarketListing"("status", "createdAt");
CREATE INDEX "MarketListing_kind_status_unitPrice_idx"
  ON "MarketListing"("kind", "status", "unitPrice");
CREATE INDEX "MarketListing_currency_status_unitPrice_idx"
  ON "MarketListing"("currency", "status", "unitPrice");
CREATE INDEX "MarketListing_sellerId_status_createdAt_idx"
  ON "MarketListing"("sellerId", "status", "createdAt");
CREATE INDEX "MarketListing_itemId_status_unitPrice_idx"
  ON "MarketListing"("itemId", "status", "unitPrice");

CREATE INDEX "MarketTrade_listingId_createdAt_idx"
  ON "MarketTrade"("listingId", "createdAt");
CREATE INDEX "MarketTrade_buyerId_createdAt_idx"
  ON "MarketTrade"("buyerId", "createdAt");
CREATE INDEX "MarketTrade_sellerId_createdAt_idx"
  ON "MarketTrade"("sellerId", "createdAt");
