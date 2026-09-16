-- v0.8 — Contas na nuvem (Supabase)
-- Coluna aditiva: id do usuário no Supabase Auth vinculado à conta local.
-- 100% reversível e sem perda de dados (NULL para todas as contas atuais).
ALTER TABLE "Account" ADD COLUMN "supabaseUserId" TEXT;
CREATE UNIQUE INDEX "Account_supabaseUserId_key" ON "Account"("supabaseUserId");
