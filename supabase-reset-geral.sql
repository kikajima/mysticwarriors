-- =====================================================================
-- GUERREIROS MÍSTICOS — BLOCO 2: RESET GERAL DA NUVEM (v0.9.10)
-- =====================================================================
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
--
-- ⚠️ ORDEM OBRIGATÓRIA (o reset completo são 3 passos):
--      1º  BLOCO 1  — backup (supabase-backup-reset.sql)          [feito]
--      2º  BOTÃO    — "Reset geral do servidor" no painel admin
--                     da PRODUÇÃO (apaga o banco do jogo com backup
--                     automático e re-semeia os bots)               [feito]
--      3º  ESTE BLOCO — apaga os personagens da NUVEM              [agora]
--
-- O QUE ESTE BLOCO APAGA:
--   * TODAS as linhas de public.personagens (o espelho de cada
--     personagem usado pelo cloud-restore e pelo ranking da nuvem);
--   * os DADOS DE JOGADOR de public.profiles (o progresso v2 legado é
--     substituído por um snapshot VAZIO v3, nivel 1, xp 0) — a LINHA do
--     perfil e o nick são MANTIDOS porque o fluxo de login/criação os
--     utiliza.
--     ⚠️ NUNCA use `progresso = null` aqui: a coluna é NOT NULL nesta
--     nuvem (erro 23502). O snapshot vazio com characters:[] tem o mesmo
--     efeito prático de "sem save" para o jogo.
--
-- O QUE ESTE BLOCO MANTEM (intocável):
--   * auth.users  — contas e logins (ninguém precisa re-cadastrar);
--   * public.admins — seu acesso de administrador;
--   * A função ranking_nuvem() e as políticas RLS — são CÓDIGO de
--     configuração, não dado de jogador (o ranking fica vazio sozinho
--     porque passa a ler uma tabela vazia);
--   * O bucket de avatares do Storage (arquivos órfãos ficam; não têm
--     efeito no jogo e podem ser ignorados).
--
-- CATÁLOGO: itens da loja, conquistas, missões, profissões, inimigos e
-- chefes NÃO vivem no Supabase — são código do jogo (content/*.ts).
-- Nada de catálogo é apagado aqui; a loja continua funcionando.
--
-- SEQUÊNCIAS/IDENTITIES: as tabelas envolvidas usam chaves text/uuid
-- geradas pelo próprio jogo — não existem colunas serial/identity para
-- reiniciar. Os novos personagens já começam "do zero" por natureza.
--
-- RODAR DE NOVO é seguro (idempotente): só apaga o que porventura
-- re-apareceu (ex.: cliente de um jogador online re-enviou a linha dele
-- entre o botão de reset e este bloco).
-- =====================================================================

-- ===== 1) Apaga TODOS os personagens da nuvem =====
delete from public.personagens;

-- ===== 2) Limpa os dados de jogador dos perfis (mantém id + nick) =====
-- Snapshot VAZIO v3 (NUNCA null — a coluna progresso é NOT NULL, erro 23502)
update public.profiles
   set progresso = jsonb_build_object(
         'version', 3,
         'savedAt', concat(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS'), 'Z'),
         'activePlayerName', null,
         'characters', '[]'::jsonb,
         'cosmeticsOwned', '[]'::jsonb
       ),
       nivel = 1,
       xp = 0;

-- ===== 3) VERIFICAÇÃO PÓS-RESET (contagens esperadas) =====
-- Esperado: personagens = 0 · perfis com progresso = 0 · contas e admins intactos
select 'personagens na nuvem (esperado 0)' as verificacao, count(*) as valor
  from public.personagens
union all
select 'perfis com progresso legado (esperado 0)', count(*)
  from public.profiles
 where jsonb_typeof(progresso->'characters') = 'array'
   and jsonb_array_length(progresso->'characters') > 0
union all
select 'perfis preservados p/ login (esperado: o mesmo de antes)', count(*)
  from public.profiles
union all
select 'contas de login auth.users (esperado: o mesmo de antes)', count(*)
  from auth.users
union all
select 'admins preservados (esperado: o mesmo de antes)', count(*)
  from public.admins;

-- ===== FIM DO BLOCO 2 — reset da nuvem concluído =====
-- Próximo passo: validação final no navegador (ver passo a passo enviado:
-- aba anônima → login com conta existente → tela de CRIAÇÃO de personagem).
