import { describe, expect, test } from 'bun:test';
import {
  COSMETIC_SLOTS,
  getCosmetic,
  parseCosmeticsEquipped,
  publicCosmeticsFromRaw,
} from '../src/lib/game/content/cosmetics';

describe('Cosméticos sociais e identidade pública', () => {
  test('nameplate e chat são slots válidos sem migração estrutural', () => {
    expect(COSMETIC_SLOTS.has('nameplate')).toBe(true);
    expect(COSMETIC_SLOTS.has('chat')).toBe(true);

    const parsed = parseCosmeticsEquipped(
      JSON.stringify({
        nameplate: 'nameplate_dragao_eterno',
        chat: 'chat_ki_dourado',
      })
    );
    expect(parsed.nameplate).toBe('nameplate_dragao_eterno');
    expect(parsed.chat).toBe('chat_ki_dourado');
  });

  test('Pose Suprema e Traje Branco do Mestre possuem efeito visual substancial', () => {
    const pose = getCosmetic('pose_suprema');
    const outfit = getCosmetic('roupa_gi_branco');

    expect(pose?.victoryPresentation?.label).toContain('POSE');
    expect(pose?.publicSurfaces).toContain('Vitória');
    expect(outfit?.identityAccentCss).toBeTruthy();
    expect(outfit?.publicSurfaces).toContain('Ranking');
  });

  test('recorte público nunca revela cosméticos possuídos, apenas equipados', () => {
    const view = publicCosmeticsFromRaw(
      JSON.stringify({
        aura: 'aura_chama',
        title: 'title_lendario',
      })
    );
    expect(view).toEqual({
      equipped: {
        aura: 'aura_chama',
        title: 'title_lendario',
      },
    });
    expect('owned' in view).toBe(false);
  });

  test('catálogo social possui nameplates e balões com efeito visual real', () => {
    expect(getCosmetic('nameplate_dragao_eterno')?.nameplateCss).toBeTruthy();
    expect(getCosmetic('nameplate_cosmico')?.nameplateCss).toBeTruthy();
    expect(getCosmetic('chat_ki_dourado')?.chatBubbleCss).toBeTruthy();
    expect(getCosmetic('chat_abissal')?.chatBubbleCss).toBeTruthy();
  });

  test('ranking, guilda, chat e ameaça recebem o recorte público', async () => {
    const ranking = await Bun.file(`${import.meta.dir}/../src/app/api/game/ranking/route.ts`).text();
    const guilds = await Bun.file(`${import.meta.dir}/../src/app/api/game/guilds/route.ts`).text();
    const chat = await Bun.file(`${import.meta.dir}/../src/app/api/chat/route.ts`).text();
    const boss = await Bun.file(`${import.meta.dir}/../src/lib/worldboss.ts`).text();

    for (const source of [ranking, guilds, chat, boss]) {
      expect(source).toContain('publicCosmeticsFromRaw');
    }
  });

  test('loja tem provador e a pose é usada no resultado da batalha', async () => {
    const shop = await Bun.file(`${import.meta.dir}/../src/components/game/ShopPanel.tsx`).text();
    const battle = await Bun.file(`${import.meta.dir}/../src/components/game/BattleLogDialog.tsx`).text();

    expect(shop).toContain('Provador de cosméticos');
    expect(shop).toContain('Experimentar');
    expect(shop).toContain('Aparece em:');
    expect(battle).toContain('victoryPresentation');
    expect(battle).toContain('victory-pose-enter');
  });

  test('ficha pública expõe somente progresso social e cosméticos equipados', async () => {
    const route = await Bun.file(`${import.meta.dir}/../src/app/api/game/public-player/route.ts`).text();

    expect(route).toContain('publicCosmeticsFromRaw(player.cosmeticsEquipped)');
    expect(route).not.toContain('cosmeticsOwned');
    expect(route).not.toContain('items:');
    expect(route).not.toContain('materials:');
  });
});
