-- Ordens de compra P2P com escrow de moeda (PostgreSQL/Supabase).
CREATE TABLE IF NOT EXISTS game."MarketBuyOrder" (
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
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "filledAt" TIMESTAMPTZ,
  "cancelledAt" TIMESTAMPTZ,
  CONSTRAINT "MarketBuyOrder_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES game."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketBuyOrder_kind_check" CHECK ("kind" IN ('material', 'equipment')),
  CONSTRAINT "MarketBuyOrder_currency_check" CHECK ("currency" IN ('zeni', 'crystal')),
  CONSTRAINT "MarketBuyOrder_status_check" CHECK ("status" IN ('active', 'filled', 'cancelled')),
  CONSTRAINT "MarketBuyOrder_price_check" CHECK ("unitPrice" > 0),
  CONSTRAINT "MarketBuyOrder_quantity_check" CHECK ("quantity" > 0 AND "quantityRemaining" >= 0 AND "quantityRemaining" <= "quantity")
);

CREATE TABLE IF NOT EXISTS game."MarketBuyOrderTrade" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" INTEGER NOT NULL,
  "totalPrice" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketBuyOrderTrade_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES game."MarketBuyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketBuyOrderTrade_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES game."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketBuyOrderTrade_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES game."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketBuyOrderTrade_currency_check" CHECK ("currency" IN ('zeni', 'crystal')),
  CONSTRAINT "MarketBuyOrderTrade_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "MarketBuyOrderTrade_price_check" CHECK ("unitPrice" > 0 AND "totalPrice" > 0)
);

CREATE INDEX IF NOT EXISTS "MarketBuyOrder_status_createdAt_idx"
  ON game."MarketBuyOrder"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketBuyOrder_kind_status_unitPrice_idx"
  ON game."MarketBuyOrder"("kind", "status", "unitPrice");
CREATE INDEX IF NOT EXISTS "MarketBuyOrder_currency_status_unitPrice_idx"
  ON game."MarketBuyOrder"("currency", "status", "unitPrice");
CREATE INDEX IF NOT EXISTS "MarketBuyOrder_buyerId_status_createdAt_idx"
  ON game."MarketBuyOrder"("buyerId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketBuyOrder_itemId_status_unitPrice_idx"
  ON game."MarketBuyOrder"("itemId", "status", "unitPrice");

CREATE INDEX IF NOT EXISTS "MarketBuyOrderTrade_orderId_createdAt_idx"
  ON game."MarketBuyOrderTrade"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketBuyOrderTrade_buyerId_createdAt_idx"
  ON game."MarketBuyOrderTrade"("buyerId", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketBuyOrderTrade_sellerId_createdAt_idx"
  ON game."MarketBuyOrderTrade"("sellerId", "createdAt");
