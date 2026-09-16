-- =====================================================================
-- GUERREIROS MÍSTICOS — RANKING VIVO v2 (v0.9.5)
-- ---------------------------------------------------------------------
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
--
-- O que muda em relação à versão anterior (supabase-persistence.sql):
--   * A RPC ranking_nuvem agora devolve também RAÇA, VITÓRIAS e
--     DERROTAS de cada personagem (antes: só nome/nível/poder).
--   * Novo parâmetro opcional p_nome: quando o jogo informa o nome do
--     personagem do PRÓPRIO jogador, a RPC devolve a posição GLOBAL
--     dele (mesmo que esteja fora da página exibida).
--
-- O que NÃO muda:
--   * Lista TODOS os personagens de TODAS as contas salvas — nenhum
--     filtro por login/online/sessão (a posição é sempre calculada
--     na hora, nunca gravada);
--   * Cada personagem tem a PRÓPRIA linha (a RPC abre a lista de
--     personagens de cada conta e lista um por um);
--   * Expõe APENAS: posição, nome, raça, nível, vitórias, derrotas,
--     poder e total — nenhum e-mail, nenhum identificador interno;
--   * Só a chave publicável é usada pelo jogo; RLS de profiles segue
--     exatamente como estava (a RPC lê os perfis, mas devolve só a
--     lista permitida).
--
-- Rodar de novo não estraga nada (é idempotente).
-- =====================================================================

create or replace function public.ranking_nuvem(
  p_limite int default 25,
  p_offset int default 0,
  p_nome text default null
)
returns table (
  posicao bigint,
  nome text,
  raca text,
  nivel int,
  vitorias int,
  derrotas int,
  poder bigint,
  total bigint,
  minha_posicao bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with chars as (
    select
      ch->>'name' as guerreiro,
      ch->>'race' as raca_char,
      (ch->>'level')::int as nivel_char,
      (ch->>'battlesWon')::int as vitorias_char,
      (ch->>'battlesLost')::int as derrotas_char,
      (ch->>'xp')::bigint as xp_char,
      (ch->>'strength')::int as forca,
      (ch->>'defense')::int as defesa,
      (ch->>'speed')::int as velocidade,
      (ch->>'ki')::int as ki
    from public.profiles pf,
         jsonb_array_elements(pf.progresso->'characters') ch
    where pf.progresso is not null
      and jsonb_typeof(pf.progresso->'characters') = 'array'
  ),
  ranked as (
    select
      guerreiro,
      raca_char,
      nivel_char,
      vitorias_char,
      derrotas_char,
      row_number() over (order by nivel_char desc, vitorias_char desc, xp_char desc) as pos,
      round(
        nivel_char * 15
        + round(forca * 2.2)
        + round(ki * 2.4) * 0.9
        + round(defesa * 1.8)
        + round(defesa * 1.1 + ki * 0.9) * 0.6
        + velocidade * 2
      )::bigint as poder_calc
    from chars
  )
  select
    ranked.pos,
    ranked.guerreiro,
    ranked.raca_char,
    ranked.nivel_char,
    ranked.vitorias_char,
    ranked.derrotas_char,
    ranked.poder_calc,
    (select count(*) from chars) as total,
    (select r.pos from ranked r where r.guerreiro = p_nome order by r.pos limit 1) as minha_posicao
  from ranked
  order by ranked.pos
  limit greatest(1, least(coalesce(p_limite, 25), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;

-- Página pública (/ranking) consulta sem login → anon precisa executar;
-- o jogo (servidor) também chama → authenticated. Ninguém mais.
revoke execute on function public.ranking_nuvem(int, int, text) from public;
grant execute on function public.ranking_nuvem(int, int, text) to anon, authenticated;

-- ===== FIM — ranking vivo v2 (raça + vitórias/derrotas + posição) =====
