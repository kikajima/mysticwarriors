-- =====================================================================
-- ETAPA 13 — FECHAMENTO OPERACIONAL DE PRODUÇÃO
-- ---------------------------------------------------------------------
-- Complementa a Etapa 12:
--   * mantém public.personagens estritamente server-authoritative;
--   * aposenta RPCs administrativas antigas baseadas em conta;
--   * impede o navegador de gravar o snapshot global;
--   * explicita quais RPCs SECURITY DEFINER continuam expostas por design.
-- =====================================================================

begin;

-- Estado de personagem: leitura própria apenas. Escrita direta pelo browser
-- continua proibida mesmo se um script histórico for reexecutado.
drop policy if exists personagens_insert_proprias on public.personagens;
drop policy if exists personagens_update_proprias on public.personagens;
drop policy if exists personagens_delete_proprias on public.personagens;
revoke insert, update, delete on table public.personagens from anon, authenticated;
grant select on table public.personagens to authenticated;

-- World boss: gravação é responsabilidade do backend.
revoke execute on function public.save_world_boss_snapshot(jsonb)
  from public, anon, authenticated;

-- RPCs legadas do painel por CONTA não são mais usadas pelo código.
drop function if exists public.admin_list_players();
drop function if exists public.admin_get_progress(uuid);
drop function if exists public.admin_update_progress(uuid, jsonb);

-- RPCs públicas de LEITURA permanecem intencionais:
-- ranking_nuvem expõe somente campos públicos do ranking;
-- get_world_boss_snapshot expõe somente o snapshot público do evento.
revoke execute on function public.ranking_nuvem(int, int, text) from public;
grant execute on function public.ranking_nuvem(int, int, text) to anon, authenticated;

revoke execute on function public.get_world_boss_snapshot() from public;
grant execute on function public.get_world_boss_snapshot() to anon, authenticated;

commit;
