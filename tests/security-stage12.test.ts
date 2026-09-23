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

  test('legacy local permanent auth is invisible in production', async () => {
    for (const rel of [
      'src/app/api/auth/login/route.ts',
      'src/app/api/auth/register/route.ts',
      'src/app/api/auth/convert/route.ts',
    ]) {
      const route = await Bun.file(path.join(ROOT, rel)).text();
      expect(route).toContain("process.env.NODE_ENV === 'production'");
      expect(route).toContain("status: 404");
    }
  });

  test('production avatar URL mode is closed against DNS rebinding SSRF', async () => {
    const route = await Bun.file(path.join(ROOT, 'src/app/api/game/avatar/route.ts')).text();

    expect(route).toContain("mode === 'url' && isPostgresDatabase()");
    expect(route).toContain('use o upload de imagem');
  });

  test('Supabase Storage avatar is revalidated by bytes and locked to safe types', async () => {
    const route = await Bun.file(path.join(ROOT, 'src/app/api/game/avatar/route.ts')).text();
    const sql = await Bun.file(path.join(ROOT, 'supabase-security-stage12.sql')).text();

    expect(route).toContain('const storedBytes = await fetchExternalImage(url)');
    expect(route).toContain('await validateImageBytes(storedBytes)');
    expect(route).toContain('avatar-\\d+');
    expect(sql).toContain('file_size_limit = 5242880');
    expect(sql).toContain("allowed_mime_types = array['image/jpeg','image/png','image/webp']");
    expect(sql).toContain("drop policy if exists avatar_upload_proprio");
  });

  test('rate-limit IP key trusts only the last X-Forwarded-For hop', async () => {
    const rate = await Bun.file(path.join(ROOT, 'src/lib/rate-limit.ts')).text();

    expect(rate).toContain("import { isIP } from 'node:net'");
    expect(rate).toContain("get('x-forwarded-for')");
    expect(rate).toContain('.at(-1)');
    expect(rate).toContain('isIP(forwarded)');
    expect(rate).not.toContain("request.headers.get('cf-connecting-ip')");
    expect(rate).not.toContain("request.headers.get('x-real-ip')");
    expect(rate).toContain("return 'unknown'");
  });

  test('session payloads are explicitly private and non-cacheable', async () => {
    const route = await Bun.file(path.join(ROOT, 'src/app/api/auth/session/route.ts')).text();
    expect(route).toContain("'cache-control': 'no-store, private'");
    expect(route).toContain('SESSION_RESPONSE');
  });

  test('unused /api hello-world endpoint is not shipped', async () => {
    expect(await Bun.file(path.join(ROOT, 'src/app/api/route.ts')).exists()).toBe(false);
  });

  test('backup export requires a strong configured secret', async () => {
    const route = await Bun.file(path.join(ROOT, 'src/app/api/admin/db-export/route.ts')).text();

    expect(route).toContain('expected.length < 32');
    expect(route).toContain('timingSafeEqual');
  });

  test('global headers block framing and unsafe object embedding', async () => {
    const config = await Bun.file(path.join(ROOT, 'next.config.mjs')).text();

    expect(config).toContain('X-Frame-Options');
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain('Cross-Origin-Opener-Policy');
  });
});
