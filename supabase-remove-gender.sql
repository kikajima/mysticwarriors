-- =====================================================================
-- supabase-remove-gender.sql — v0.16 (remoção definitiva do gênero)
-- ---------------------------------------------------------------------
-- CONTEXTO: a tabela `personagens` NUNCA teve uma coluna `gender` — o
-- gênero vivia DENTRO do snapshot JSONB `estado` (campo "gender" do
-- contrato CLOUD_PROGRESS_VERSION v3). Este script:
--   1) remove o campo "gender" do `estado` de TODAS as linhas existentes;
--   2) remove o campo "gender" de snapshots aninhados, se algum legado
--      o tiver (defensivo — o formato atual não aninha).
--
-- EXECUÇÃO: SQL Editor do Supabase (produção), uma única vez, junto com
-- o deploy da v0.16. NÃO é bloqueante para o jogo: o leitor novo ignora
-- o campo legado ("leitura tolerante") — este script é HIGIENE de dados
-- (o próximo save de cada jogador já escreve sem o campo de qualquer
-- forma; este script apenas adianta a limpeza dos inativos).
--
-- Idempotente: pode ser executado mais de uma vez sem efeito colateral.
-- Verificação: a query final deve listar 0 linhas.
-- =====================================================================

-- 1) Remove "gender" do snapshot principal de cada personagem
update public.personagens
   set estado = estado - 'gender',
       atualizado_em = now()
 where estado ? 'gender';

-- 2) Verificação: deve retornar 0
select count(*) as linhas_com_gender_restante
  from public.personagens
 where estado ? 'gender';

-- =====================================================================
-- NOTA sobre a base de dev/local (Prisma/SQLite): a remoção lá é feita
-- pela migration 20260916110000_v016_remove_gender (DROP COLUMN) via
-- `bun run db:push`. O código do jogo (create/route, engine, snapshot,
-- restore, UI) já não lê nem escreve gênero em NENHUMA camada.
-- =====================================================================
