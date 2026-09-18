import { expect, test } from 'bun:test';
import { isOnline, touchPresence } from '../src/lib/game/presence';

test('presença de guilda é informativa e expira pela janela', () => {
  const id = `QA_Presence_${Date.now()}`;
  const before = Date.now();
  expect(isOnline(id, before)).toBe(false);
  expect(touchPresence(id)).toBe(true);
  expect(isOnline(id, before + 60_000)).toBe(true);
  expect(isOnline(id, before + 121_000)).toBe(false);
});

test('rotas paralelas não podem voltar a mutar guildas', async () => {
  for (const path of [
    'src/app/api/game/guilds/create/route.ts',
    'src/app/api/game/guilds/donate/route.ts',
    'src/app/api/game/guilds/invite/route.ts',
    'src/app/api/game/guilds/roles/route.ts',
  ]) {
    expect(await Bun.file(`${import.meta.dir}/../${path}`).exists()).toBe(false);
  }
});

test('API de leitura mantém o contrato do painel completo', async () => {
  const route = await Bun.file(`${import.meta.dir}/../src/app/api/game/guilds/route.ts`).text();
  for (const contract of ['myGuild', 'publicGuild', 'invitations', 'permissions', 'donors', 'guildCapacity']) {
    expect(route).toContain(contract);
  }
});
