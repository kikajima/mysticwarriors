-- =====================================================================
-- ETAPA 12 — HARDENING DA NUVEM AUTORITATIVA
-- ---------------------------------------------------------------------
-- A partir desta etapa, public.personagens é um ESPELHO server-authoritative.
-- O navegador pode ler somente as próprias linhas para UI/compatibilidade,
-- mas NÃO pode inserir, alterar nem excluir estado de jogo diretamente.
--
-- O backend grava/limpa usando a conexão PostgreSQL privada (DATABASE_URL).
-- Ranking e RPCs administrativas continuam funcionando normalmente.
-- =====================================================================

begin;

-- Remove as antigas políticas que permitiam ao usuário fabricar o próprio
-- estado de jogo e depois apresentá-lo como "save da nuvem".
drop policy if exists personagens_insert_proprias on public.personagens;
drop policy if exists personagens_update_proprias on public.personagens;
drop policy if exists personagens_delete_proprias on public.personagens;

-- SELECT próprio continua permitido para compatibilidade visual, mas não é
-- mais usado como fonte de autoridade pelo backend de restauração.
drop policy if exists personagens_select_proprias on public.personagens;
create policy personagens_select_proprias
  on public.personagens
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Defesa em profundidade: mesmo que uma policy de escrita seja recriada por
-- engano no futuro, os papéis expostos pela API não têm privilégios DML.
revoke insert, update, delete on table public.personagens from anon, authenticated;
grant select on table public.personagens to authenticated;

-- O snapshot do chefe global é somente backend/RPC de leitura.
revoke all on table public.world_boss_snapshots from anon, authenticated;
revoke execute on function public.save_world_boss_snapshot(jsonb) from public, anon, authenticated;

-- Storage de avatar: o bucket também impõe o mesmo contrato da aplicação.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[]
where id = 'avatars';

drop policy if exists avatar_upload_proprio on storage.objects;
create policy avatar_upload_proprio
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name like (auth.uid()::text || '/avatar-%')
    and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
    and coalesce(metadata->>'mimetype','') in ('image/jpeg','image/png','image/webp')
  );

commit;
