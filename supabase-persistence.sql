-- =====================================================================
-- MYST KI WARRIORS — TUDO NA NUVEM (v0.9.4)
-- ---------------------------------------------------------------------
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
--
-- O que ele faz (nada além do necessário):
--   1. Cria o bucket público "avatars" no Storage — as imagens de avatar
--      enviadas pelos jogadores passam a viver NA NUVEM (sobrevivem a
--      qualquer limpeza do servidor do jogo).
--   2. Policies do Storage: cada usuário logado só envia imagem para a
--      PRÓPRIA pasta ("{userId}/..."), só imagens, até 5 MB. Leitura
--      pública (o avatar aparece para todos no jogo/ranking).
--   3. Cria a RPC ranking_nuvem() — o ranking público passa a ser
--      CALCULADO AO VIVO no Postgres a partir dos snapshots em
--      profiles.progresso. Nada de posição gravada.
--
-- Segurança mantida:
--   * Nenhum DELETE concedido a usuários pela API;
--   * A RPC expõe APENAS nome, nível e poder (a fórmula do jogo) —
--     nenhum e-mail, nenhum dado interno de outros jogadores;
--   * Sem service_role: só a chave publicável é usada pelo jogo;
--   * RLS de profiles segue exatamente como estava.
--
-- Rodar de novo não estraga nada (é idempotente).
-- =====================================================================

-- ===== 1) Bucket público de avatares =====

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ===== 2) Policies do Storage =====

-- Leitura pública (a URL pública do avatar funciona para qualquer visitante)
drop policy if exists "avatar_leitura_publica" on storage.objects;
create policy "avatar_leitura_publica" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- Upload: apenas usuários logados, apenas na PRÓPRIA pasta
-- ("{userId}/avatar-..."), apenas imagens, até 5 MB.
drop policy if exists "avatar_upload_proprio" on storage.objects;
create policy "avatar_upload_proprio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '/%'
    and coalesce((metadata->>'mimetype') like 'image/%', false)
    and coalesce((metadata->>'size')::bigint, 0) <= 5242880
  );

-- (DELETE e UPDATE continuam SEM policy: jogadores não apagam nem
--  sobrescrevem arquivos pela API — avatares antigos apenas somem do
--  personagem, os bytes ficam guardados.)

-- ===== 3) Ranking público calculado ao vivo =====
-- Ordena TODOS os personagens de TODOS os perfis por nível → vitórias →
-- XP (a mesma ordem do jogo) e calcula o poder com a MESMA fórmula do
-- scouter do jogo. security definer para ler os perfis, mas devolve
-- SOMENTE: posição, nome, nível, poder e total.

create or replace function public.ranking_nuvem(p_limite int default 25, p_offset int default 0)
returns table (posicao bigint, nome text, nivel int, poder bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with chars as (
    select
      ch->>'name' as guerreiro,
      (ch->>'level')::int as nivel_char,
      (ch->>'battlesWon')::int as vitorias,
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
      nivel_char,
      row_number() over (order by nivel_char desc, vitorias desc, xp_char desc) as pos,
      round(
        nivel_char * 15
        + round(forca * 2.2)
        + round(ki * 2.4) * 0.9
        + round(defesa * 1.8)
        + round(defesa * 1.1 + ki * 0.9) * 0.6
        + velocidade * 2
      )::bigint as poder
    from chars
  )
  select
    ranked.pos,
    ranked.guerreiro,
    ranked.nivel_char,
    ranked.poder,
    (select count(*) from chars) as total
  from ranked
  order by ranked.pos
  limit greatest(1, least(coalesce(p_limite, 25), 100))
  offset greatest(0, coalesce(p_offset, 0))
$$;

-- Página pública (/ranking) consulta sem login → anon precisa executar;
-- o jogo também pode chamar logado → authenticated.
revoke execute on function public.ranking_nuvem(int, int) from public;
grant execute on function public.ranking_nuvem(int, int) to anon, authenticated;

-- ===== FIM — avatares na nuvem + ranking ao vivo =====
