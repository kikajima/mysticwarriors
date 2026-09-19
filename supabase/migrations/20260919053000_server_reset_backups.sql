create table if not exists game."ServerResetBackup" (
  "id" text primary key,
  "payload" bytea not null,
  "manifest" text not null,
  "createdAt" timestamptz(3) not null default current_timestamp
);

create index if not exists "ServerResetBackup_createdAt_idx"
  on game."ServerResetBackup"("createdAt");

revoke all on table game."ServerResetBackup" from anon, authenticated;
