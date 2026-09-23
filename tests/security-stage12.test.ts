import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const ROOT = path.join(import.meta.dir, '..');

describe('Release stage 12 — cloud authority hardening', () => {
  test('restore never trusts game state supplied by the browser', async () => {
    const route = await Bun.file(path.join(ROOT, 'src/app/api/game/cloud-restore/route.ts')).text();

    expect(route).toContain('verifySupabaseIdentity');
    expect(route).toContain('loadAuthoritativeCloudCharacters');
    expect(route).toContain("'personagens' in body");
    expect(route).toContain("'progresso' in body");
    expect(route).toContain('Estado de restauração não pode ser enviado pelo cliente.');
    expect(route).not.toContain('sanitizeCloudProgress(parsed.data.progresso)');
    expect(route).not.toContain('sanitizeCharacterRows(parsed.data.personagens)');
  });

  test('cloud snapshot is persisted by the server-side PostgreSQL connection', async () => {
    const route = await Bun.file(path.join(ROOT, 'src/app/api/game/cloud-snapshot/route.ts')).text();
    const serverCloud = await Bun.file(path.join(ROOT, 'src/lib/supabase/serverCloud.ts')).text();

    expect(route).toContain('syncAuthoritativeCloudCharacters');
    expect(route).toContain('cloudSynced: true');
    expect(serverCloud).toContain('INSERT INTO public.personagens');
    expect(serverCloud).toContain('WHERE public.personagens.user_id = EXCLUDED.user_id');
    expect(serverCloud).toContain('DELETE FROM public.personagens');
    expect(serverCloud).toContain('WHERE user_id = ${userId}::uuid');
  });

  test('browser no longer writes or deletes public.personagens', async () => {
    const page = await Bun.file(path.join(ROOT, 'src/app/jogar/page.tsx')).text();

    expect(page).not.toContain('upsertCloudCharacters(');
    expect(page).not.toContain('deleteStaleCloudCharacters(');
    expect(page).not.toContain('loadCloudCharacters()');
    expect(page).toContain('snap.cloudSynced !== true');
    expect(page).toContain('Authorization: `Bearer ${session.access_token}`');
    expect(page).toContain("body: '{}'");
  });

  test('server verifies the Supabase identity before reading cloud rows', async () => {
    const serverCloud = await Bun.file(path.join(ROOT, 'src/lib/supabase/serverCloud.ts')).text();

    expect(serverCloud).toContain('supabaseUserEndpoint()');
    expect(serverCloud).toContain('user.id !== expectedUserId');
    expect(serverCloud).toContain('A sessão da nuvem não pertence a esta conta.');
  });
});
