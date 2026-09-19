create schema if not exists game;

revoke all on schema game from anon, authenticated;
alter default privileges in schema game revoke all on tables from anon, authenticated;
alter default privileges in schema game revoke all on sequences from anon, authenticated;

create table game."Account" (
  "id" text primary key,
  "username" text,
  "usernameLower" text,
  "passwordHash" text not null default '',
  "isGuest" boolean not null default false,
  "supabaseUserId" text,
  "activePlayerId" text,
  "createdAt" timestamptz(3) not null default current_timestamp,
  "updatedAt" timestamptz(3) not null
);
create unique index "Account_username_key" on game."Account"("username");
create unique index "Account_usernameLower_key" on game."Account"("usernameLower");
create unique index "Account_supabaseUserId_key" on game."Account"("supabaseUserId");
create unique index "Account_activePlayerId_key" on game."Account"("activePlayerId");
create index "Account_isGuest_idx" on game."Account"("isGuest");

create table game."Guild" (
  "id" text primary key,
  "name" text not null,
  "description" text not null default '',
  "leaderId" text not null,
  "level" integer not null default 1,
  "xp" integer not null default 0,
  "totalDonated" integer not null default 0,
  "createdAt" timestamptz(3) not null default current_timestamp,
  "motd" text not null default '',
  "stateVersion" integer not null default 0,
  "disbandedAt" timestamptz(3)
);
create unique index "Guild_name_key" on game."Guild"("name");
create index "Guild_level_idx" on game."Guild"("level");

create table game."Player" (
  "id" text primary key,
  "name" text not null,
  "race" text not null,
  "avatarUrl" text,
  "level" integer not null default 1,
  "xp" integer not null default 0,
  "zeni" integer not null default 500,
  "crystals" integer not null default 0,
  "hp" integer not null default 100,
  "strength" integer not null default 10,
  "defense" integer not null default 10,
  "speed" integer not null default 10,
  "ki" integer not null default 10,
  "energy" integer not null default 100,
  "battlesWon" integer not null default 0,
  "battlesLost" integer not null default 0,
  "pvpWins" integer not null default 0,
  "trainingsDone" integer not null default 0,
  "guildDonated" integer not null default 0,
  "missionsDone" integer not null default 0,
  "dragonBalls" integer not null default 0,
  "miracleWins" integer not null default 0,
  "davidWins" integer not null default 0,
  "isBot" boolean not null default false,
  "items" text not null default '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}',
  "techniques" text not null default '[]',
  "loadout" text not null default '{"1":null,"2":null,"3":null,"S":null}',
  "strategy" text not null default 'balanced',
  "missionId" text,
  "missionEndsAt" timestamptz(3),
  "missionsCompleted" text not null default '[]',
  "professions" text,
  "transformationId" text,
  "transformationsOwned" text not null default '[]',
  "lastZenkaiAt" timestamptz(3),
  "zenkaiWindowStart" timestamptz(3),
  "zenkaiCount24h" integer not null default 0,
  "lastZenkaiOpponentId" text,
  "pveBattleDay" text,
  "pveBattleCount" integer not null default 0,
  "stateVersion" integer not null default 0,
  "lastRegen" timestamptz(3) not null default current_timestamp,
  "lastRegenHp" timestamptz(3),
  "cosmeticsEquipped" text,
  "cosmeticsOwned" text,
  "talents" text not null default '[]',
  "tournament" text,
  "tournamentTitles" integer not null default 0,
  "tournamentRoundWins" integer not null default 0,
  "createdAt" timestamptz(3) not null default current_timestamp,
  "updatedAt" timestamptz(3) not null,
  "accountId" text,
  "guildId" text,
  constraint "Player_accountId_fkey" foreign key ("accountId") references game."Account"("id") on delete set null,
  constraint "Player_guildId_fkey" foreign key ("guildId") references game."Guild"("id") on delete set null
);
create unique index "Player_name_key" on game."Player"("name");
create index "Player_accountId_idx" on game."Player"("accountId");
create index "Player_guildId_idx" on game."Player"("guildId");
create index "Player_level_battlesWon_xp_idx" on game."Player"("level","battlesWon","xp");
create index "Player_isBot_idx" on game."Player"("isBot");
create index "Player_transformationId_idx" on game."Player"("transformationId");

alter table game."Account"
  add constraint "Account_activePlayerId_fkey"
  foreign key ("activePlayerId") references game."Player"("id") on delete set null;

create table game."Session" (
  "id" text primary key,
  "token" text not null,
  "accountId" text not null,
  "expiresAt" timestamptz(3) not null,
  "createdAt" timestamptz(3) not null default current_timestamp,
  "revokedAt" timestamptz(3),
  "userAgent" text,
  constraint "Session_accountId_fkey" foreign key ("accountId") references game."Account"("id") on delete cascade
);
create unique index "Session_token_key" on game."Session"("token");
create index "Session_accountId_idx" on game."Session"("accountId");
create index "Session_expiresAt_idx" on game."Session"("expiresAt");

create table game."GuildRole" (
  "id" text primary key,
  "guildId" text not null,
  "name" text not null,
  "rank" integer not null,
  "permissions" text not null default '[]',
  constraint "GuildRole_guildId_fkey" foreign key ("guildId") references game."Guild"("id") on delete cascade
);
create unique index "GuildRole_guildId_name_key" on game."GuildRole"("guildId","name");

create table game."GuildRoleAssignment" (
  "playerId" text primary key,
  "roleId" text not null,
  constraint "GuildRoleAssignment_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade,
  constraint "GuildRoleAssignment_roleId_fkey" foreign key ("roleId") references game."GuildRole"("id") on delete cascade
);

create table game."GuildInvitation" (
  "id" text primary key,
  "guildId" text not null,
  "playerId" text not null,
  "inviterId" text not null,
  "expiresAt" timestamptz(3) not null,
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "GuildInvitation_guildId_fkey" foreign key ("guildId") references game."Guild"("id") on delete cascade,
  constraint "GuildInvitation_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create unique index "GuildInvitation_guildId_playerId_key" on game."GuildInvitation"("guildId","playerId");
create index "GuildInvitation_playerId_expiresAt_idx" on game."GuildInvitation"("playerId","expiresAt");

create table game."GuildActionReceipt" (
  "id" text primary key,
  "playerId" text not null,
  "requestId" text not null,
  "result" text not null,
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "GuildActionReceipt_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create unique index "GuildActionReceipt_playerId_requestId_key" on game."GuildActionReceipt"("playerId","requestId");

create table game."WalletTransaction" (
  "id" text primary key,
  "accountId" text,
  "playerId" text not null,
  "currency" text not null,
  "amount" integer not null,
  "type" text not null,
  "source" text not null,
  "balanceBefore" integer not null,
  "balanceAfter" integer not null,
  "metadata" text,
  "externalPaymentId" text,
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "WalletTransaction_accountId_fkey" foreign key ("accountId") references game."Account"("id") on delete set null,
  constraint "WalletTransaction_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create index "WalletTransaction_playerId_createdAt_idx" on game."WalletTransaction"("playerId","createdAt");
create index "WalletTransaction_source_idx" on game."WalletTransaction"("source");
create index "WalletTransaction_accountId_idx" on game."WalletTransaction"("accountId");

create table game."QuestProgress" (
  "id" text primary key,
  "playerId" text not null,
  "questId" text not null,
  "kind" text not null,
  "period" text not null,
  "progress" integer not null default 0,
  "target" integer not null,
  "rewardZeni" integer not null default 0,
  "rewardXp" integer not null default 0,
  "rewardCrystals" integer not null default 0,
  "claimed" boolean not null default false,
  "claimedAt" timestamptz(3),
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "QuestProgress_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create unique index "QuestProgress_playerId_questId_period_key" on game."QuestProgress"("playerId","questId","period");
create index "QuestProgress_playerId_period_idx" on game."QuestProgress"("playerId","period");

create table game."AchievementState" (
  "id" text primary key,
  "playerId" text not null,
  "achievementId" text not null,
  "progress" integer not null default 0,
  "unlockedAt" timestamptz(3),
  "claimedAt" timestamptz(3),
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "AchievementState_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create unique index "AchievementState_playerId_achievementId_key" on game."AchievementState"("playerId","achievementId");
create index "AchievementState_playerId_idx" on game."AchievementState"("playerId");

create table game."WorldBoss" (
  "id" text primary key,
  "name" text not null,
  "emoji" text not null,
  "description" text not null default '',
  "maxHp" integer not null,
  "currentHp" integer not null,
  "level" integer not null default 50,
  "strength" integer not null default 300,
  "defense" integer not null default 200,
  "speed" integer not null default 150,
  "ki" integer not null default 280,
  "startsAt" timestamptz(3) not null default current_timestamp,
  "endsAt" timestamptz(3) not null,
  "status" text not null default 'active',
  "zeniReward" integer not null default 0,
  "xpReward" integer not null default 0,
  "crystalReward" integer not null default 0,
  "defeatedAt" timestamptz(3),
  "createdAt" timestamptz(3) not null default current_timestamp
);
create index "WorldBoss_status_idx" on game."WorldBoss"("status");

create table game."WorldBossDamage" (
  "id" text primary key,
  "bossId" text not null,
  "playerId" text not null,
  "damage" integer not null default 0,
  "attacks" integer not null default 0,
  "rewarded" boolean not null default false,
  "lastAttackedAt" timestamptz(3) not null default current_timestamp,
  constraint "WorldBossDamage_bossId_fkey" foreign key ("bossId") references game."WorldBoss"("id") on delete cascade,
  constraint "WorldBossDamage_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create unique index "WorldBossDamage_bossId_playerId_key" on game."WorldBossDamage"("bossId","playerId");
create index "WorldBossDamage_bossId_damage_idx" on game."WorldBossDamage"("bossId","damage");

create table game."Season" (
  "id" text primary key,
  "name" text not null,
  "number" integer not null default 1,
  "startsAt" timestamptz(3) not null,
  "endsAt" timestamptz(3) not null,
  "status" text not null default 'active',
  "createdAt" timestamptz(3) not null default current_timestamp
);
create index "Season_status_idx" on game."Season"("status");

create table game."SeasonRankEntry" (
  "id" text primary key,
  "seasonId" text not null,
  "playerId" text not null,
  "points" integer not null default 0,
  "wins" integer not null default 0,
  "updatedAt" timestamptz(3) not null,
  constraint "SeasonRankEntry_seasonId_fkey" foreign key ("seasonId") references game."Season"("id") on delete cascade,
  constraint "SeasonRankEntry_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create unique index "SeasonRankEntry_seasonId_playerId_key" on game."SeasonRankEntry"("seasonId","playerId");
create index "SeasonRankEntry_seasonId_points_idx" on game."SeasonRankEntry"("seasonId","points");

create table game."GuildDonation" (
  "id" text primary key,
  "playerId" text not null,
  "guildId" text not null,
  "amount" integer not null,
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "GuildDonation_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create index "GuildDonation_guildId_idx" on game."GuildDonation"("guildId");
create index "GuildDonation_playerId_idx" on game."GuildDonation"("playerId");

create table game."Purchase" (
  "id" text primary key,
  "accountId" text not null,
  "product" text not null,
  "currency" text not null default 'crystal',
  "amount" integer not null default 0,
  "status" text not null default 'completed',
  "externalPaymentId" text,
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "Purchase_accountId_fkey" foreign key ("accountId") references game."Account"("id") on delete cascade
);
create index "Purchase_accountId_idx" on game."Purchase"("accountId");
create index "Purchase_product_idx" on game."Purchase"("product");

create table game."CosmeticOwned" (
  "id" text primary key,
  "accountId" text not null,
  "cosmetic" text not null,
  "equipped" boolean not null default false,
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "CosmeticOwned_accountId_fkey" foreign key ("accountId") references game."Account"("id") on delete cascade
);
create unique index "CosmeticOwned_accountId_cosmetic_key" on game."CosmeticOwned"("accountId","cosmetic");

create table game."GameMeta" (
  "key" text primary key,
  "value" text not null,
  "updatedAt" timestamptz(3) not null
);

create table game."RequestDedup" (
  "id" text primary key,
  "playerId" text not null,
  "requestId" text not null,
  "result" text,
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "RequestDedup_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create unique index "RequestDedup_playerId_requestId_key" on game."RequestDedup"("playerId","requestId");
create index "RequestDedup_createdAt_idx" on game."RequestDedup"("createdAt");

create table game."Activity" (
  "id" text primary key,
  "playerId" text not null,
  "kind" text not null,
  "payload" text not null default '{}',
  "result" text,
  "startedAt" timestamptz(3) not null default current_timestamp,
  "endsAt" timestamptz(3) not null,
  "completedAt" timestamptz(3),
  "createdAt" timestamptz(3) not null default current_timestamp,
  constraint "Activity_playerId_fkey" foreign key ("playerId") references game."Player"("id") on delete cascade
);
create index "Activity_playerId_completedAt_idx" on game."Activity"("playerId","completedAt");
create index "Activity_endsAt_idx" on game."Activity"("endsAt");

create table game."AdminActionLog" (
  "id" text primary key,
  "adminEmail" text not null,
  "action" text not null,
  "targetType" text not null,
  "targetName" text not null,
  "layers" text not null default '{}',
  "result" text not null,
  "details" text,
  "createdAt" timestamptz(3) not null default current_timestamp
);
create index "AdminActionLog_createdAt_idx" on game."AdminActionLog"("createdAt");

create table game."AnalyticsEvent" (
  "id" text primary key,
  "name" text not null,
  "playerId" text,
  "accountId" text,
  "metadata" text,
  "createdAt" timestamptz(3) not null default current_timestamp
);
create index "AnalyticsEvent_name_createdAt_idx" on game."AnalyticsEvent"("name","createdAt");

revoke all on all tables in schema game from anon, authenticated;
