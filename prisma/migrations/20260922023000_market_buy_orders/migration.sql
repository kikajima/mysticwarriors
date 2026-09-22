-- Ordens de compra P2P com escrow de moeda (SQLite/testes).
CREATE TABLE "MarketBuyOrder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "buyerId" TEXT NOT NULL,
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
  "filledAt" DATETIME,
  "cancelledAt" DATETIME,
  CONSTRAINT "MarketBuyOrder_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketBuyOrderTrade" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "totalPrice" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketBuyOrderTrade_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "MarketBuyOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketBuyOrderTrade_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketBuyOrderTrade_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MarketBuyOrder_status_createdAt_idx"
  ON "MarketBuyOrder"("status", "createdAt");
CREATE INDEX "MarketBuyOrder_kind_status_unitPrice_idx"
  ON "MarketBuyOrder"("kind", "status", "unitPrice");
CREATE INDEX "MarketBuyOrder_currency_status_unitPrice_idx"
  ON "MarketBuyOrder"("currency", "status", "unitPrice");
CREATE INDEX "MarketBuyOrder_buyerId_status_createdAt_idx"
  ON "MarketBuyOrder"("buyerId", "status", "createdAt");
CREATE INDEX "MarketBuyOrder_itemId_status_unitPrice_idx"
  ON "MarketBuyOrder"("itemId", "status", "unitPrice");

CREATE INDEX "MarketBuyOrderTrade_orderId_createdAt_idx"
  ON "MarketBuyOrderTrade"("orderId", "createdAt");
CREATE INDEX "MarketBuyOrderTrade_buyerId_createdAt_idx"
  ON "MarketBuyOrderTrade"("buyerId", "createdAt");
CREATE INDEX "MarketBuyOrderTrade_sellerId_createdAt_idx"
  ON "MarketBuyOrderTrade"("sellerId", "createdAt");
