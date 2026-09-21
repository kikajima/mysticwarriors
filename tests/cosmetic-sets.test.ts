import { describe, expect, test } from 'bun:test';
import {
  COSMETIC_SETS,
  activeCosmeticSets,
  cosmeticSetProgress,
  dominantCosmeticSet,
  getCosmetic,
  getCosmeticSet,
} from '../src/lib/game/content/cosmetics';

describe('Coleções cosméticas temáticas', () => {
  test('catálogo possui quatro conjuntos com peças válidas e sem duplicação', () => {
    expect(COSMETIC_SETS.map((set) => set.id)).toEqual([
      'ascensao_dourada',
      'heranca_dragao',
      'vazio_cosmico',
      'caminho_mestre',
    ]);

    const seen = new Set<string>();
    for (const set of COSMETIC_SETS) {
      expect(set.pieceIds.length).toBeGreaterThanOrEqual(3);
      expect(set.milestones.length).toBeGreaterThan(0);

      for (const id of set.pieceIds) {
        const piece = getCosmetic(id);
        expect(piece, `${set.id}: peça ${id} deve existir`).toBeTruthy();
        expect(piece?.setId).toBe(set.id);
        expect(seen.has(id), `${id} não pode pertencer a dois conjuntos`).toBe(false);
        seen.add(id);
      }

      const thresholds = set.milestones.map((milestone) => milestone.pieces);
      expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
      expect(thresholds.at(-1)).toBeLessThanOrEqual(set.pieceIds.length);
    }
  });

  test('possuir peças aumenta coleção, mas NÃO ativa marco sem equipar', () => {
    const set = getCosmeticSet('ascensao_dourada')!;
    const progress = cosmeticSetProgress(
      set,
      ['aura_divina', 'title_campeao', 'frame_dourada', 'avatar_dourado'],
      {}
    );

    expect(progress.ownedCount).toBe(4);
    expect(progress.equippedCount).toBe(0);
    expect(progress.activeMilestone).toBeNull();
    expect(progress.nextMilestone?.pieces).toBe(2);
  });

  test('Ascensão Dourada ativa os marcos de 2, 4 e 6 peças equipadas', () => {
    const set = getCosmeticSet('ascensao_dourada')!;

    const two = cosmeticSetProgress(set, [], {
      aura: 'aura_divina',
      title: 'title_campeao',
    });
    expect(two.activeMilestone?.pieces).toBe(2);
    expect(two.activeMilestone?.name).toBe('Centelha Dourada');

    const four = cosmeticSetProgress(set, [], {
      aura: 'aura_divina',
      title: 'title_campeao',
      frame: 'frame_dourada',
      avatar: 'avatar_dourado',
    });
    expect(four.activeMilestone?.pieces).toBe(4);
    expect(four.activeMilestone?.profileCss).toBeTruthy();

    const full = cosmeticSetProgress(set, [], {
      aura: 'aura_divina',
      title: 'title_campeao',
      frame: 'frame_dourada',
      avatar: 'avatar_dourado',
      pose: 'pose_suprema',
      chat: 'chat_ki_dourado',
    });
    expect(full.equippedCount).toBe(6);
    expect(full.activeMilestone?.pieces).toBe(6);
    expect(full.activeMilestone?.victoryCss).toBeTruthy();
    expect(full.nextMilestone).toBeNull();
  });

  test('conjuntos simultâneos são permitidos e o visual dominante usa o maior marco', () => {
    const equipped = {
      frame: 'frame_dragao',
      background: 'bg_planeta_namek',
      nameplate: 'nameplate_dragao_eterno',
      aura: 'aura_trovao',
      effect: 'fx_teleporte',
    } as const;

    const active = activeCosmeticSets(equipped);
    expect(active.map((entry) => entry.set.id)).toContain('heranca_dragao');
    expect(active.map((entry) => entry.set.id)).toContain('vazio_cosmico');

    const dominant = dominantCosmeticSet(equipped);
    expect(dominant?.set.id).toBe('heranca_dragao');
    expect(dominant?.activeMilestone.pieces).toBe(3);
  });

  test('milestones são estritamente visuais: nenhum campo de poder/economia existe', () => {
    const forbidden = [
      'strength',
      'defense',
      'speed',
      'ki',
      'power',
      'damage',
      'xp',
      'zeni',
      'crystals',
      'energy',
      'hp',
    ];

    for (const set of COSMETIC_SETS) {
      for (const milestone of set.milestones) {
        const keys = Object.keys(milestone);
        for (const field of forbidden) {
          expect(keys).not.toContain(field);
        }
      }
    }
  });

  test('loja, identidade, ficha, chat, dashboard e vitória consomem efeitos de conjunto', async () => {
    const files = {
      shop: await Bun.file(`${import.meta.dir}/../src/components/game/ShopPanel.tsx`).text(),
      identity: await Bun.file(`${import.meta.dir}/../src/components/game/PublicPlayerIdentity.tsx`).text(),
      profile: await Bun.file(`${import.meta.dir}/../src/components/game/PublicPlayerProfileDialog.tsx`).text(),
      chat: await Bun.file(`${import.meta.dir}/../src/components/ChatWidget.tsx`).text(),
      dashboard: await Bun.file(`${import.meta.dir}/../src/components/game/Dashboard.tsx`).text(),
      battle: await Bun.file(`${import.meta.dir}/../src/components/game/BattleLogDialog.tsx`).text(),
    };

    expect(files.shop).toContain('Coleções temáticas');
    expect(files.shop).toContain('cosmeticSetProgress');
    expect(files.shop).toContain('Prévia do conjunto completo');
    expect(files.identity).toContain('activeCosmeticSets');
    expect(files.profile).toContain('Coleções ativas');
    expect(files.chat).toContain('setEffect?.chatCss');
    expect(files.dashboard).toContain('activeSets.map');
    expect(files.battle).toContain('victorySet');
  });
});
