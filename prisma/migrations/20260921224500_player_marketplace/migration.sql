-- Mercado P2P com escrow de materiais/equipamentos (SQLite/testes).
CREATE TABLE "MarketListing" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "buyerId" TEXT,
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
    FOREIGN KEY ("sellerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketListing_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "MarketListing_status_createdAt_idx"
  ON "MarketListing"("status", "createdAt");
CREATE INDEX "MarketListing_kind_status_unitPrice_idx"
  ON "MarketListing"("kind", "status", "unitPrice");
CREATE INDEX "MarketListing_currency_status_unitPrice_idx"
  ON "MarketListing"("currency", "status", "unitPrice");
CREATE INDEX "MarketListing_sellerId_status_createdAt_idx"
  ON "MarketListing"("sellerId", "status", "createdAt");
CREATE INDEX "MarketListing_buyerId_soldAt_idx"
  ON "MarketListing"("buyerId", "soldAt");
CREATE INDEX "MarketListing_itemId_status_unitPrice_idx"
  ON "MarketListing"("itemId", "status", "unitPrice");
