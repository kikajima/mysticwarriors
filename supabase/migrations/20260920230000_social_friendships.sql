-- Amizades e bloqueios sociais integrados ao chat.
create table game."Friendship" (
  "id" text primary key,
  "playerAId" text not null,
  "playerBId" text not null,
  "requestedById" text not null,
  "status" text not null default 'pending',
  "createdAt" timestamptz(3) not null default current_timestamp,
  "updatedAt" timestamptz(3) not null,
  "acceptedAt" timestamptz(3),
  constraint "Friendship_playerAId_fkey" foreign key ("playerAId") references game."Player"("id") on delete cascade,
  constraint "Friendship_playerBId_fkey" foreign key ("playerBId") references game."Player"("id") on delete cascade,
  constraint "Friendship_requestedById_fkey" foreign key ("requestedById") references game."Player"("id") on delete cascade
);
create unique index "Friendship_playerAId_playerBId_key" on game."Friendship"("playerAId","playerBId");
create index "Friendship_playerAId_status_idx" on game."Friendship"("playerAId","status");
create index "Friendship_playerBId_status_idx" on game."Friendship"("playerBId","status");
create index "Friendship_requestedById_status_idx" on game."Friendship"("requestedById","status");

create table game."PlayerBlock" (
  "id" text primary key,
  "playerId" text not null,
  "blockedPlayerId" text not null,
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "PlayerBlock_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade,
  constraint "PlayerBlock_blockedPlayerId_fkey" foreign key ("blockedPlayerId") references game."Player"("id") on delete cascade
);
create unique index "PlayerBlock_playerId_blockedPlayerId_key" on game."PlayerBlock"("playerId","blockedPlayerId");
create index "PlayerBlock_playerId_createdAt_idx" on game."PlayerBlock"("playerId","createdAt");
create index "PlayerBlock_blockedPlayerId_idx" on game."PlayerBlock"("blockedPlayerId");
