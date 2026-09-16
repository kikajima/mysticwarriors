// =====================================================================
// v0.9.11 — REGRESSÃO DO COOLDOWN DO CHEFE GLOBAL (corrige a volta de 60s)
//  * ATTACK_COOLDOWN_SEC é a FONTE ÚNICA exportada — valor de projeto: 10s
//  * rate limit do boss DERIVA do cooldown (nunca número solto de novo)
//  * world_boss_attack continua permitido durante missão de profissão
// =====================================================================
import { describe, expect, test } from 'bun:test';
import { ATTACK_COOLDOWN_SEC, bossAttacksPerWindow } from '@/lib/worldboss';
import { MISSION_BLOCKED_ACTIONS } from '@/lib/game/rules';

describe('Chefe global — cooldown (v0.9.11, regressão corrigida)', () => {
  test('cooldown é 10 SEGUNDOS (pino anti-regressão: já voltou a 60 uma vez)', () => {
    expect(ATTACK_COOLDOWN_SEC).toBe(10);
  });

  test('rate limit do boss DERIVA do cooldown — janela de 60s comporta a cadência legítima', () => {
    // cadência legítima máxima: 1 ataque por cooldown → 6 ataques em 60s
    const legitCadence = Math.floor(60_000 / (ATTACK_COOLDOWN_SEC * 1000));
    const limit = bossAttacksPerWindow(60_000);
    expect(limit).toBeGreaterThanOrEqual(legitCadence); // nunca bloqueia jogador legítimo
    expect(limit).toBeLessThanOrEqual(legitCadence + 2); // folga pequena (anti-spam continua eficaz)
  });

  test('janelas menores também derivam do cooldown (fonte única)', () => {
    // 30s / 10s = 3 de cadência + 1 de folga
    expect(bossAttacksPerWindow(30_000)).toBe(Math.ceil(30_000 / (ATTACK_COOLDOWN_SEC * 1000)) + 1);
  });

  test('cooldown curto nunca produz limite absurdo (piso de segurança)', () => {
    expect(bossAttacksPerWindow(1_000)).toBeGreaterThanOrEqual(2);
  });

  test('atacar o chefe continua PERMITIDO durante turno de profissão (matriz v0.16)', () => {
    expect(MISSION_BLOCKED_ACTIONS.has('world_boss_attack')).toBe(false);
  });
});
