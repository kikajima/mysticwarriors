-- Mercado P2P com escrow de materiais/equipamentos (PostgreSQL/Supabase).
CREATE TABLE IF NOT EXISTS game."MarketListing" (
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
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "soldAt" TIMESTAMPTZ,
  "cancelledAt" TIMESTAMPTZ,
  CONSTRAINT "MarketListing_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES game."Player"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketListing_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES game."Player"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MarketListing_kind_check" CHECK ("kind" IN ('material', 'equipment')),
  CONSTRAINT "MarketListing_currency_check" CHECK ("currency" IN ('zeni', 'crystal')),
  CONSTRAINT "MarketListing_status_check" CHECK ("status" IN ('active', 'sold', 'cancelled')),
  CONSTRAINT "MarketListing_price_check" CHECK ("unitPrice" > 0),
  CONSTRAINT "MarketListing_quantity_check" CHECK ("quantity" > 0 AND "quantityRemaining" >= 0 AND "quantityRemaining" <= "quantity")
);

CREATE INDEX IF NOT EXISTS "MarketListing_status_createdAt_idx"
  ON game."MarketListing"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketListing_kind_status_unitPrice_idx"
  ON game."MarketListing"("kind", "status", "unitPrice");
CREATE INDEX IF NOT EXISTS "MarketListing_currency_status_unitPrice_idx"
  ON game."MarketListing"("currency", "status", "unitPrice");
CREATE INDEX IF NOT EXISTS "MarketListing_sellerId_status_createdAt_idx"
  ON game."MarketListing"("sellerId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "MarketListing_buyerId_soldAt_idx"
  ON game."MarketListing"("buyerId", "soldAt");
CREATE INDEX IF NOT EXISTS "MarketListing_itemId_status_unitPrice_idx"
  ON game."MarketListing"("itemId", "status", "unitPrice");
