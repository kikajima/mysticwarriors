import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const ROOT = path.join(import.meta.dir, '..');

describe('Release stage 11 — client functional resilience', () => {
  test('cloud saves are serialized instead of silently dropped', async () => {
    const source = await Bun.file(path.join(ROOT, 'src/app/jogar/page.tsx')).text();

    expect(source).toContain('useRef<Promise<boolean> | null>(null)');
    expect(source).toContain('while (cloudSaveInFlightRef.current)');
    expect(source).toContain('await cloudSaveInFlightRef.current.catch(() => false)');
    expect(source).toContain('cloudSaveInFlightRef.current = run');
    expect(source).toContain('if (cloudSaveInFlightRef.current === run) cloudSaveInFlightRef.current = null');
    expect(source).not.toContain('auth.isGuest || cloudSaveInFlightRef.current');
  });

  test('selected character is persisted with an idempotent retry', async () => {
    const source = await Bun.file(path.join(ROOT, 'src/app/jogar/page.tsx')).text();

    expect(source).toContain('const persistActivePlayer = useCallback');
    expect(source).toContain("type: 'select_player', requestId");
    expect(source).toContain('for (let attempt = 0; attempt < 2; attempt++)');
    expect(source).toContain('void persistActivePlayer(p.id)');
  });

  test('critical release flows remain represented by automated suites', async () => {
    const required = [
      'tests/chat.test.ts',
      'tests/crafting-integration.test.ts',
      'tests/guild-management.test.ts',
      'tests/marketplace.test.ts',
      'tests/market-buy-orders.test.ts',
      'tests/tournament.test.ts',
      'tests/tournament-result-sync.test.ts',
      'tests/persistence.test.ts',
      'tests/security-hardening.test.ts',
      'tests/dragon-ball-consistency.test.ts',
      'tests/cosmetics-public.test.ts',
      'tests/equipment-slots.test.ts',
    ];

    for (const file of required) {
      expect(await Bun.file(path.join(ROOT, file)).exists()).toBe(true);
    }
  });
});
