import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const ROOT = path.join(import.meta.dir, '..');

describe('Release stage 13 — production readiness', () => {
  test('browser Supabase client contains no direct game-state mutation helpers', async () => {
    const client = await Bun.file(path.join(ROOT, 'src/lib/supabase/client.ts')).text();

    expect(client).not.toContain('upsertCloudCharacters(');
    expect(client).not.toContain('deleteStaleCloudCharacters(');
    expect(client).not.toContain('saveCloudWorldBoss(');
    expect(client).not.toContain(".from('personagens')\n    .upsert(");
    expect(client).not.toContain(".from('personagens')\n    .delete()");
    expect(client).not.toContain("rpc('save_world_boss_snapshot'");
  });

  test('legacy account-level admin RPC wrappers are gone', async () => {
    const admin = await Bun.file(path.join(ROOT, 'src/lib/supabase/admin.ts')).text();

    for (const legacy of [
      'admin_list_players',
      'admin_get_progress',
      'admin_update_progress',
      'adminListCloudPlayers',
      'adminGetCloudProgress',
      'adminUpdateCloudProgress',
    ]) {
      expect(admin).not.toContain(legacy);
    }
  });

  test('installation and historical SQL cannot reopen personagens DML', async () => {
    for (const rel of [
      'supabase-instalacao-nova-base.sql',
      'supabase-migration-v096.sql',
    ]) {
      const sql = await Bun.file(path.join(ROOT, rel)).text();
      expect(sql).not.toContain('grant select, insert, update, delete on public.personagens to authenticated;');
      expect(sql).not.toContain('create policy "personagens_insert_proprias"');
      expect(sql).not.toContain('create policy "personagens_update_proprias"');
      expect(sql).not.toContain('create policy "personagens_delete_proprias"');
      expect(sql).toContain('revoke insert, update, delete on table public.personagens from anon, authenticated;');
      expect(sql).toContain('grant select on table public.personagens to authenticated;');
    }
  });

  test('world boss client-side save grant stays closed', async () => {
    const sql = await Bun.file(path.join(ROOT, 'supabase-worldboss.sql')).text();
    expect(sql).not.toContain('grant execute on function public.save_world_boss_snapshot(jsonb) to authenticated;');
    expect(sql).toContain('revoke execute on function public.save_world_boss_snapshot(jsonb) from public, anon, authenticated;');
  });

  test('stage 13 migration retires legacy RPCs and preserves intentional public reads', async () => {
    const sql = await Bun.file(path.join(ROOT, 'supabase-security-stage13.sql')).text();

    expect(sql).toContain('drop function if exists public.admin_list_players()');
    expect(sql).toContain('drop function if exists public.admin_get_progress(uuid)');
    expect(sql).toContain('drop function if exists public.admin_update_progress(uuid, jsonb)');
    expect(sql).toContain('grant execute on function public.ranking_nuvem(int, int, text) to anon, authenticated;');
    expect(sql).toContain('grant execute on function public.get_world_boss_snapshot() to anon, authenticated;');
  });
});
