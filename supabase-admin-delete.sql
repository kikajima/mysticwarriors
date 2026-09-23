-- =====================================================================
-- MYST KI WARRIORS — RPC admin_delete_personagem (v0.14)
-- ---------------------------------------------------------------------
-- COLE ESTE BLOCO INTEIRO NO SQL EDITOR DO SUPABASE E CLIQUE EM "Run".
-- Instalação ÚNICA (uma vez só) — depois disso, o botão "Excluir" do
-- painel admin apaga o personagem escolhido NAS DUAS CAMADAS num clique
-- só: o banco do jogo (servidor) E a linha espelhada aqui na nuvem.
--
-- O QUE ESTA RPC FAZ (tudo numa transação só, quando chamada pelo painel):
--   1. BACKUP do alvo: copia a linha de `personagens` para
--      personagens_backup_reset — a MESMA tabela de backup do
--      admin_reset_cloud (reversível pelo SQL Editor);
--   2. APAGA SÓ a linha do alvo (p_personagem_id) — nunca toca em
--      nenhum outro personagem, perfil ou tabela;
--   3. Valida que o nome digitado pelo admin (p_confirm_nome) bate com
--      o nome DA LINHA — a confirmação dupla é checada NA PONTA TAMBÉM;
--   4. Devolve um relatório (JSON) com as contagens — o painel exibe.
--
-- O QUE ELA NÃO TOCA:
--   * nenhuma OUTRA linha de `personagens` (o reset geral continua
--     sendo o caminho para apagar tudo);
--   * auth.users (a CONTA dona continua existindo e logando — só o
--     espelho do personagem morre; sem espelho, o cloud-restore não
--     ressuscita nada);
--   * public.profiles (nick/nível de exibição da conta — cosmético);
--   * bucket de avatares do Storage (arquivo órfão fica, inofensivo).
--
-- SEGURANÇA (mesmo modelo das demais RPCs do painel):
--   * security definer + verificação is_admin() INTERNA — só a conta
--     administradora (tabela public.admins) executa; qualquer outra
--     conta recebe erro 42501 (Não autorizado);
--   * NENHUMA chave secreta/service_role — o jogo chama com a chave
--     publicável + o token do próprio admin;
--   * confirmação obrigatória: p_confirm_nome deve ser IGUAL ao nome do
--     personagem da linha (o painel envia o que o admin digitou).
--
-- RODAR DE NOVO este bloco é SEGURO (create or replace — não apaga
-- nada por si só; só re-instala a função).
-- =====================================================================

begin;

-- Remove the incompatible overload; no CASCADE (dependencies must be reviewed).
drop function if exists public.admin_delete_personagem(uuid, text);

create or replace function public.admin_delete_personagem(
  p_personagem_id text,
  p_confirm_nome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_nome text;
  v_backup int := 0;
  v_deleted int := 0;
begin
  -- ===== 1) só o admin =====
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  -- ===== 2) confirmação ausente → recusa com código 22023 =====
  -- (o pré-cheque do jogo usa exatamente este erro para detectar que a
  --  RPC está instalada: chama com confirmação inválida de propósito)
  if p_confirm_nome is null or btrim(p_confirm_nome) = '' then
    raise exception 'Confirmação ausente — envie o nome do personagem para confirmar.' using errcode = '22023';
  end if;

  -- ===== 3) o alvo existe? o nome digitado bate com o da linha? =====
  select p.nome into v_nome
  from public.personagens p
  where p.id = p_personagem_id
  for update;

  if v_nome is null then
    -- linha já não existe: sucesso honesto com zero (idempotente —
    -- exclusões concorrentes/repetidas não explodem)
    return jsonb_build_object(
      'ok', true,
      'personagens_apagados', 0,
      'backup_personagens', 0,
      'observacao', 'linha não encontrada na nuvem (nada a apagar)'
    );
  end if;

  if v_nome <> btrim(p_confirm_nome) then
    raise exception 'Nome digitado não confere com o personagem da linha (%).', v_nome using errcode = '22023';
  end if;

  -- ===== 4) backup do alvo (mesma tabela do admin_reset_cloud) =====
  create table if not exists public.personagens_backup_reset (like public.personagens including all);
  alter table public.personagens_backup_reset enable row level security;
  revoke all on table public.personagens_backup_reset from public, anon, authenticated;

  insert into public.personagens_backup_reset
  select p.*
  from public.personagens p
  where p.id = p_personagem_id
  on conflict do nothing;
  get diagnostics v_backup = row_count;

  -- ===== 5) apaga SÓ o alvo =====
  delete from public.personagens
  where id = p_personagem_id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'personagens_apagados', v_deleted,
    'backup_personagens', v_backup,
    'nome', v_nome
  );
end;
$$;

-- ===== Permissões de execução =====
-- Mesma política das demais RPCs do painel: anônimos bloqueados,
-- authenticated liberados (a verificação interna is_admin() é quem decide).
revoke execute on function public.admin_delete_personagem(text, text) from public, anon;
grant execute on function public.admin_delete_personagem(text, text) to authenticated;

-- ===== FIM — exclusão de personagem único liberada para o painel =====

notify pgrst, 'reload schema';
commit;
