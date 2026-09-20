create table if not exists game."PlayerNotification" (
  "id" text primary key,
  "playerId" text not null references game."Player"("id") on delete cascade on update cascade,
  "kind" text not null,
  "title" text not null,
  "message" text not null,
  "metadata" text,
  "createdAt" timestamp(3) not null default current_timestamp,
  "deliveredAt" timestamp(3)
);

create index if not exists "PlayerNotification_playerId_deliveredAt_createdAt_idx"
  on game."PlayerNotification"("playerId", "deliveredAt", "createdAt");
