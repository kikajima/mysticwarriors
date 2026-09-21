// =====================================================================
// TESTE DE CONTRATO WIKI ↔ JOGO (v0.9.23 — auditoria total da wiki)
// ---------------------------------------------------------------------
// Objetivo (definição do dono): "a próxima mudança de gameplay quebra o
// teste e obriga a wiki a ser atualizada junto".
//
// Três famílias de contrato:
//  A) COMPORTAMENTO — lê o CÓDIGO-FONTE dos handlers reais (o caminho de
//     execução vivo) e garante que o que a wiki afirma sobre o fluxo é
//     verdade: profissão não debita energia, treino é instantâneo e
//     cobra energia, etc. Mudou o handler → o teste quebra.
//  B) VALORES — os números publicados na wiki são derivados DAS
//     CONSTANTES REAIS (importadas) e o texto renderizado precisa
//     contê-los. Mudou a constante sem atualizar a wiki → quebra.
//  C) ESTRUTURA — ids/âncoras estáveis, "Em resumo" em toda seção e a
//     busca indexando o conteúdo dos blocos expandíveis.
// =====================================================================

import { describe, expect, test } from 'bun:test';
import {
  WIKI_SECTIONS,
  getWikiSection,
  sectionSearchText,
} from '../src/lib/wiki/wiki-content';
import {
  BATTLE_ENERGY_COST,
  GUILD_CREATION_COST,
  REGEN,
  SHOP_ITEMS,
  TRAIN_ENERGY_COST,
  ENEMIES,
  PROFESSION_LEVELS,
  PROFESSION_SHIFTS,
  PROFESSION_MATERIALS,
  PROFESSION_MATERIAL_TIER_LEVEL,
  PROFESSION_MASTERY_HOURS,
  DRAGON_BALL_SEARCH_SHIFTS,
  xpToNextLevel,
} from '../src/lib/game/content/world';
import { COMBAT, MAX_ROUNDS, BASIC_ENERGY_KI_COST } from '../src/lib/game/engine';
import { IMPETO } from '../src/lib/game/impeto';
import { POWER_SCALES } from '../src/lib/game/powerScale';
import {
  TOURNAMENT_ROUNDS,
  TOURNAMENT_COOLDOWN_MS,
  TOURNAMENT_ENTRY_FEE,
  tournamentZeniReward,
} from '../src/lib/game/content/tournament';
import { RACES } from '../src/lib/game/content/races';
import { CRAFT_RECIPES, CRAFT_STACK_ITEMS, CRAFT_TIER_PROFESSION_LEVEL } from '../src/lib/game/content/crafting';
import {
  ATTACK_COOLDOWN_SEC,
  ATTACK_ENERGY_COST,
  BOSS_DURATION_HOURS,
  MIN_PARTICIPATION_DAMAGE,
} from '../src/lib/worldboss';

// ---------------------------------------------------------------------
// Fonte dos handlers reais (caminho de execução vivo)
// ---------------------------------------------------------------------

const actionsSrc = await Bun.file(`${import.meta.dir}/../src/lib/game/actions.ts`).text();

/** Extrai o corpo de uma função entre dois marcadores do código-fonte. */
function fnBody(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Marcador não encontrado no fonte de actions.ts: ${startMarker}`);
  }
  return src.slice(start, end);
}

const professionBody = fnBody(
  actionsSrc,
  'async function actionStartProfession',
  'async function actionClaimProfession'
);
const trainBody = fnBody(actionsSrc, 'async function actionStartTrain', '// ===== PROFISSÕES');
const dragonSearchBody = fnBody(
  actionsSrc,
  'async function actionSearchDragonBall',
  'async function actionCancelDragonBallSearch'
);

/** Texto completo (indexável) de uma seção da wiki. */
function wikiText(id: string): string {
  const section = getWikiSection(id);
  if (!section) throw new Error(`Seção da wiki não encontrada: ${id}`);
  return sectionSearchText(section);
}

// =====================================================================
// A) CONTRATOS DE COMPORTAMENTO — o fluxo real cobra (ou não) o que a
//    wiki publica. Source scan do HANDLER vivo, não da constante.
// =====================================================================

describe('CONTRATO A — comportamento dos handlers reais × afirmações da wiki', () => {
  test('PROFISSÃO NÃO GASTA ENERGIA: handler vivo não debita energia (v0.9)', () => {
    // O handler real (actionStartProfession) não pode ter débito de energia
    expect(professionBody).not.toContain('energy: { decrement');
    expect(professionBody).not.toContain('PROFESSION_ENERGY_COST');
    expect(professionBody).not.toContain('INSUFFICIENT_ENERGY');
  });

  test('PROFISSÃO NÃO GASTA ENERGIA: wiki publica exatamente isso', () => {
    const t = wikiText('profissoes') + ' ' + wikiText('accoes-custos');
    expect(t).toContain('sem custo de energia');
    expect(t).toContain('não gasta energia');
    // e NÃO publica nenhum custo em ⚡ para profissão na seção dela
    expect(wikiText('profissoes')).not.toMatch(/\d+\s*⚡/);
    expect(wikiText('accoes-custos')).toContain('0 ⚡');
  });

  test('TREINO É INSTANTÂNEO: handler aplica na hora, sem atividade temporizada (v0.9)', () => {
    expect(trainBody).toContain('applyTrainResult'); // ganho concedido NA transação do clique
    expect(trainBody).not.toContain('activity.create'); // nenhuma atividade com duração
  });

  test('TREINO COBRA ENERGIA: handler debita TRAIN_ENERGY_COST de verdade', () => {
    expect(trainBody).toContain('TRAIN_ENERGY_COST');
    expect(trainBody).toContain('energy: { decrement: TRAIN_ENERGY_COST }');
  });

  test('WIKI: treino publicado como instantâneo + custo real; sem duração fantasma', () => {
    const atributos = wikiText('atributos');
    const custos = wikiText('accoes-custos');
    expect(atributos).toContain('instantâneo');
    expect(custos).toContain('Instantâneo');
    expect(custos).toContain(`${TRAIN_ENERGY_COST} ⚡`);
    // a antiga duração de 1,6 s (constante morta) não pode voltar
    expect(atributos + custos).not.toContain('1,6 s');
  });

  test('BUSCA PELAS ESFERAS NÃO GASTA ENERGIA: handler e Wiki concordam', () => {
    expect(dragonSearchBody).not.toContain('DRAGON_BALL_SEARCH_ENERGY_COST');
    expect(dragonSearchBody).not.toContain('energy: { decrement');
    expect(dragonSearchBody).not.toContain("'energy_spent'");
    expect(dragonSearchBody).not.toContain('INSUFFICIENT_ENERGY');
    const t = wikiText('esferas-dragao') + ' ' + wikiText('accoes-custos');
    expect(t).toContain('não gasta energia');
    expect(t).toContain('0 ⚡');
  });

  test('ATRIBUTOS NÃO TÊM TETO DE GAMEPLAY: código e Wiki não reintroduzem 999', async () => {
    const rulesSrc = await Bun.file(`${import.meta.dir}/../src/lib/game/rules.ts`).text();
    const trainingSrc = await Bun.file(`${import.meta.dir}/../src/components/game/TrainingPanel.tsx`).text();
    const t = wikiText('atributos') + ' ' + wikiText('profissoes') + ' ' + wikiText('esferas-dragao');
    expect(rulesSrc).not.toContain('STAT_CAP');
    expect(trainingSrc).not.toContain('value >= 999');
    expect(t).toContain('sem teto máximo');
    expect(t).not.toContain('teto 999');
    expect(t).not.toContain('teto de 999');
  });

  test('TRABALHO BLOQUEIA EXATAMENTE 3 AÇÕES: PvE, torneio e Busca de Esferas', async () => {
    const rulesSrc = await Bun.file(`${import.meta.dir}/../src/lib/game/rules.ts`).text();
    const blocked = fnBody(rulesSrc, 'MISSION_BLOCKED_ACTIONS', ']);');
    expect(blocked).not.toContain("'train'");
    expect(blocked).toContain("'battle'");
    expect(blocked).toContain("'tournament_fight'");
    expect(blocked).toContain("'search_dragon_ball'");
    // matriz FECHADA: nenhum outro bloqueio de missão além dos 3
    expect(blocked).not.toContain("'attack_player'");
    expect(blocked).not.toContain("'buy'");
    expect(blocked).not.toContain("'heal'");
    expect(blocked).not.toContain("'create_guild'");
    expect(blocked).not.toContain("'donate_guild'");
    expect(blocked).not.toContain("'claim_");
    // o allowlist antigo morreu — o identificador não pode voltar a existir
    expect(rulesSrc).not.toContain('MISSION_ALLOWED_ACTIONS');
    // e a wiki primeiros-passos não pode afirmar que dá para lutar trabalhando
    expect(wikiText('primeiros-passos')).not.toContain('você já pode lutar');
    // a wiki publica a matriz consolidada (v0.16)
    const ocupacao = wikiText('accoes-custos');
    expect(ocupacao).toContain('TRABALHANDO bloqueia APENAS 3 ações');
    expect(ocupacao).toContain('Busca pelas Esferas');
    expect(ocupacao).toContain('Matriz ação × estado');
    expect(ocupacao).toContain('coletar é sempre possível');
    expect(ocupacao).toContain('Coletar recompensa (qualquer tipo)');
    expect(ocupacao).not.toContain('só é permitido atacar o');
  });

  test('HOSPITAL REMOVIDO — não existe ação de cura nem referência na wiki atual', () => {
    expect(actionsSrc).not.toContain("case 'heal':");
    expect(actionsSrc).not.toContain('async function actionHeal');
    expect(actionsSrc).not.toContain("source: 'hospital'");
    const t = wikiText('recursos') + wikiText('fim-de-luta') + wikiText('accoes-custos');
    expect(t.toLowerCase()).not.toContain('hospital');
    expect(t).toContain('regeneração natural');
  });

  test('TÉCNICAS — GARANTIA DE ≥1 USO POR BATALHA (v0.9.24 D1): engine força a 1ª oportunidade', async () => {
    // o motor vivo precisa: (1) aceitar o flag noTechniqueYet;
    // (2) transformá-lo em CERTEZA a partir da 3ª rodada
    const engineSrc = await Bun.file(`${import.meta.dir}/../src/lib/game/engine.ts`).text();
    expect(engineSrc).toContain('noTechniqueYet');
    expect(engineSrc).toContain('roundsSoFar >= 3');
    const guarantee = fnBody(engineSrc, 'export function chooseAttackAction', 'const bias =');
    expect(guarantee).toContain('guarantee ||');
    // e a wiki publica a garantia na seção de técnicas
    expect(wikiText('tecnicas')).toContain('pelo menos 1 técnica por batalha');
  });

  test('GUILDAS — SEM GUILDA DE SISTEMA (v0.15, decisão do dono): mundo começa com ZERO guildas', async () => {
    // (1) o mecanismo MORREU: a rota NÃO garante mais nenhuma guilda —
    //     e o módulo do bootstrap NÃO existe mais no código
    const guildsRouteSrc = await Bun.file(`${import.meta.dir}/../src/app/api/game/guilds/route.ts`).text();
    expect(guildsRouteSrc).not.toContain('ensureSystemGuild');
    const systemGuildExists = await Bun.file(`${import.meta.dir}/../src/lib/game/systemGuild.ts`).exists();
    expect(systemGuildExists).toBe(false);
    const guildManagement = await Bun.file(`${import.meta.dir}/../src/lib/game/guilds.ts`).text();
    expect(guildManagement).toContain('disbandedAt: new Date()');
    expect(guildManagement).not.toContain('guildDonation.deleteMany');
    // (3) a wiki NÃO menciona guilda de sistema nem Mestre Kame como líder
    const t = wikiText('guildas');
    expect(t).not.toContain('guilda pública do sistema');
    expect(t).not.toContain('Mestre Kame');
    expect(t).toContain('ZERO guildas');
    // (4) fundação normal inalterada: custo segue o publicado
    expect(t).toContain(GUILD_CREATION_COST.toLocaleString('pt-BR'));
  });
});

// =====================================================================
// B) CONTRATOS DE VALORES — números publicados derivados das constantes
//    reais (importadas dos módulos que o fluxo usa).
// =====================================================================

describe('CONTRATO B — valores publicados = constantes reais', () => {
  test('Ações e custos: treino/batalha/boss com os valores cobrados pelos handlers', () => {
    const t = wikiText('accoes-custos') + ' ' + wikiText('world-boss');
    expect(TRAIN_ENERGY_COST).toBe(3);
    expect(BATTLE_ENERGY_COST).toBe(3);
    expect(ATTACK_ENERGY_COST).toBe(10);
    expect(t).toContain(`${TRAIN_ENERGY_COST} ⚡`);
    expect(t).toContain(`${BATTLE_ENERGY_COST} ⚡`);
    expect(t).toContain(`${ATTACK_ENERGY_COST} de energia`);
    expect(t).toContain(`${ATTACK_ENERGY_COST} ⚡`);
    expect(t).toContain(`${ATTACK_COOLDOWN_SEC} s`);
    expect(t).toContain('60 min reais');
  });

  test('Regeneração: energia 1/5min e vida 1/12s — exatamente como o applyRegen aplica', () => {
    const t = wikiText('recursos');
    expect(REGEN.energySeconds).toBe(300);
    expect(REGEN.hpSeconds).toBe(12);
    expect(t).toContain(`${REGEN.energySeconds / 60} minutos`);
    expect(t).toContain(`${REGEN.hpSeconds} segundos`);
  });

  test('Combate: limite de rodadas, Ki básico e parâmetros centrais', () => {
    const t = wikiText('combate') + wikiText('fim-de-luta');
    expect(MAX_ROUNDS).toBe(40);
    expect(BASIC_ENERGY_KI_COST).toBe(10);
    expect(Math.round(COMBAT.variance * 100)).toBe(15);
    expect(Math.round(COMBAT.maxMitigationPct * 100)).toBe(80);
    expect(t).toContain(`${MAX_ROUNDS} rodadas`);
    expect(t).toContain(`${BASIC_ENERGY_KI_COST} de Ki`);
    expect(t).toContain('±15%');
    expect(t).toContain('80%');
    expect(t).toContain(`${Math.round(COMBAT.kiRegenPerRound * 100)}% do máximo`);
  });

  test('Ímpeto: início, teto e custos publicados = IMPETO real', () => {
    const t = wikiText('impeto');
    expect(IMPETO.start).toBe(1);
    expect(IMPETO.max).toBe(6);
    expect(IMPETO.comboCost).toBe(1);
    expect(IMPETO.heroicDefenseCost).toBe(2);
    expect(IMPETO.quebraCost).toBe(3);
    expect(t).toContain(`**${IMPETO.start}**`);
    expect(t).toContain(`**${IMPETO.max}**`);
    expect(t).toContain(`${IMPETO.comboCost} Ímpeto`);
    expect(t).toContain(`${IMPETO.heroicDefenseCost} Ímpetos`);
    expect(t).toContain(`${IMPETO.quebraCost} Ímpetos`);
  });

  test('Escalas de Poder: patamares publicados = POWER_SCALES reais', () => {
    const t = wikiText('escala-poder');
    for (const s of POWER_SCALES) {
      expect(t).toContain(s.nome);
    }
    expect(t).toContain(POWER_SCALES[1].threshold.toLocaleString('pt-BR')); // 120 — Marcial
    expect(t).toContain(POWER_SCALES[9].threshold.toLocaleString('pt-BR')); // 100.000 — Transcendente
  });

  test('Torneio: rodadas, premiação, taxa de inscrição e cooldown publicados = content/tournament real', () => {
    const t = wikiText('torneio');
    const cooldownMin = Math.round(TOURNAMENT_COOLDOWN_MS / 60_000);
    expect(cooldownMin).toBe(30);
    expect(t).toContain(`${cooldownMin} min`);
    // v0.9.24 (C1) — taxa de inscrição publicada = constante real
    expect(TOURNAMENT_ENTRY_FEE).toBe(200);
    expect(t).toContain(TOURNAMENT_ENTRY_FEE.toLocaleString('pt-BR'));
    for (const r of TOURNAMENT_ROUNDS) {
      expect(t).toContain(tournamentZeniReward(r.round, 10).toLocaleString('pt-BR'));
      expect(t).toContain(tournamentZeniReward(r.round, 100).toLocaleString('pt-BR'));
      expect(t).toContain(`${Math.round(r.powerMult * 100)}% do seu poder`);
    }
    expect(t).toContain('não concede cristais/diamantes diretamente');
  });

  test('Chefe mundial: duração, participação e cadência = worldboss.ts real', () => {
    const t = wikiText('world-boss');
    expect(BOSS_DURATION_HOURS).toBe(48);
    expect(MIN_PARTICIPATION_DAMAGE).toBe(500);
    expect(ATTACK_COOLDOWN_SEC).toBe(10);
    expect(t).toContain(`${BOSS_DURATION_HOURS / 24} dias`);
    expect(t).toContain(MIN_PARTICIPATION_DAMAGE.toLocaleString('pt-BR'));
  });

  test('PvP: range de níveis e porcentagens de roubo publicadas', () => {
    const t = wikiText('pvp');
    expect(t).toContain('É possível desafiar qualquer nível');
    expect(t).toContain('8%');
    expect(t).toContain('5%');
  });

  test('PvE: recompensas do primeiro e do último capanga = ENEMIES reais', () => {
    const t = wikiText('pve');
    const first = ENEMIES[0];
    const last = ENEMIES[ENEMIES.length - 1];
    expect(t).toContain(`~${first.zeniReward.toLocaleString('pt-BR')} Zeni`);
    expect(t).toContain(`~${first.xpReward.toLocaleString('pt-BR')} XP`);
    expect(t).toContain(`~${last.zeniReward.toLocaleString('pt-BR')} Zeni`);
    expect(t).toContain(`~${last.xpReward.toLocaleString('pt-BR')} XP`);
  });

  test('Recursos: curva de XP publicada = xpToNextLevel real', () => {
    const t = wikiText('recursos');
    expect(t).toContain(xpToNextLevel(1).toLocaleString('pt-BR'));
    expect(t).toContain(xpToNextLevel(10).toLocaleString('pt-BR'));
    expect(t).toContain(xpToNextLevel(20).toLocaleString('pt-BR'));
    expect(t).toContain(xpToNextLevel(30).toLocaleString('pt-BR'));
  });

  test('Loja: Elixir do Dragão com preço FIXO em cristais do catálogo real', () => {
    const t = wikiText('loja');
    const elixir = SHOP_ITEMS.find((i) => i.id === 'elixir_dragao');
    expect(elixir).toBeDefined();
    expect(elixir!.price).toBe(75);
    expect(t).toContain(`${elixir!.price} 💎`);
    // o antigo enquadramento de preço dinâmico em Zeni (código morto) não pode voltar
    expect(t).not.toContain('1,6×');
  });

  test('Raças: Androide sem claim de energia em trabalho (bônus +5% Zeni mantido)', () => {
    const t = wikiText('racas');
    expect(t).toContain('+5% de Zeni em trabalhos');
    expect(t).not.toContain('menos energia');
  });

  test('Raças: wiki publica os modificadores de combate REAIS do Androide (recalibração v-auditoria F3)', () => {
    const t = wikiText('racas');
    const andro = RACES.androide.combat;
    // velocidade: (speedMult − 1) em % com vírgula pt-BR
    const speedPct = ((andro.speedMult - 1) * 100).toFixed(1).replace('.', ',');
    expect(t).toContain(`+${speedPct}% velocidade`);
    expect(t).toContain(`+${(andro.dodgeBonus * 100).toFixed(1).replace('.', ',')}% esquiva`);
    expect(t).toContain(`+${Math.round(andro.kiAttackChanceBonus * 100)}% chance de atacar com Ki`);
    // o texto antigo (pré-recalibração) não pode voltar
    expect(t).not.toContain('+5% velocidade');
    expect(t).not.toContain('+2% chance de atacar com Ki');
  });
});

  test('Profissões: wiki publica carreira 1–10, turnos e loot a partir das constantes reais', () => {
    const t = wikiText('profissoes');
    expect(t).toContain(`${PROFESSION_MASTERY_HOURS.toLocaleString('pt-BR')} horas`);
    for (const shift of PROFESSION_SHIFTS) {
      expect(t).toContain(`${shift.hours}h`);
      const bonus = shift.efficiency <= 1 ? 'Base' : `+${Math.round((shift.efficiency - 1) * 100)}%`;
      expect(t).toContain(bonus);
    }
    expect(t).toContain(`${PROFESSION_LEVELS[0].xpPerPlayerLevel} × nível do personagem`);
    expect(t).toContain(`${PROFESSION_LEVELS[9].xpPerPlayerLevel} × nível do personagem`);
    expect(t).toContain('XP é proporcional ao nível do personagem');
    expect(t).toContain('ganho de atributo é sempre um **número inteiro**');
    for (const tier of PROFESSION_LEVELS) {
      expect(t).toContain(`+${Math.trunc(tier.attributeMilliPerHour / 1000).toLocaleString('pt-BR')}`);
      expect(tier.attributeMilliPerHour % 1000).toBe(0);
    }
    expect(t).toContain(`${(PROFESSION_LEVELS[9].rareChance * 100).toLocaleString('pt-BR')}%`);
    expect(t).toContain('1–2 materiais comuns garantidos');
    const search = wikiText('esferas-dragao');
    expect(search).toContain('1h a 12h');
    expect(search).toContain('20%');
    expect(search).toContain('não gasta energia');
    for (const shift of DRAGON_BALL_SEARCH_SHIFTS) expect(search).toContain(`${shift.hours}h`);
    for (const material of PROFESSION_MATERIALS) {
      expect(t).toContain(material.name);
    }
    for (const tier of [1, 2, 3, 4, 5] as const) {
      expect(t).toContain(`Nível ${PROFESSION_MATERIAL_TIER_LEVEL[tier]}`);
    }
  });

  test('Oficina: wiki publica receitas, custos, tempos e blueprints reais', () => {
    const t = wikiText('profissoes');
    expect(t).toContain('Oficina');
    expect(t).toContain('1% por nível');
    expect(t).toContain('10%');
    expect(t).toContain('canceladas com reembolso integral');
    expect(t).toContain('8 espaços equipáveis em 7 categorias');
    expect(t).toContain('Cabeça');
    expect(t).toContain('Punhos');
    expect(t).toContain('Pernas');
    expect(t).toContain('Botas');
    expect(t).toContain('Acessório I');
    expect(t).toContain('Acessório II');
    expect(t).toContain('Oficina é a progressão superior');
    for (const tier of [2, 3, 4, 5] as const) {
      expect(t).toContain(`Tier ${tier}`);
      expect(t).toContain(`Nv. ${CRAFT_TIER_PROFESSION_LEVEL[tier]}`);
    }
    for (const recipe of CRAFT_RECIPES) {
      expect(t).toContain(recipe.name);
      expect(t).toContain(recipe.costZeni.toLocaleString('pt-BR'));
      if ((recipe.maxBatch ?? 1) > 1) expect(t).toContain(`1–${recipe.maxBatch}×`);
      for (const requirement of recipe.professionRequirements ?? []) {
        expect(t).toContain(`Nv. ${requirement.level}`);
      }
    }
    for (const blueprint of CRAFT_STACK_ITEMS) {
      expect(t).toContain(blueprint.name);
    }
  });

// =====================================================================
// C) CONTRATOS DE ESTRUTURA — âncoras estáveis, "Em resumo", busca
// =====================================================================

describe('CONTRATO C — estrutura da wiki (âncoras, resumo, busca)', () => {
  test('As 23 seções mantêm ids/âncoras estáveis (bookmarks não quebram)', () => {
    const expectedIds = [
      'primeiros-passos', 'contas',
      'combate', 'impeto', 'escala-poder', 'fim-de-luta', 'estrategias', 'tecnicas', 'talentos',
      'atributos', 'recursos', 'accoes-custos', 'racas', 'transformacoes', 'profissoes', 'pve', 'pvp', 'torneio', 'world-boss',
      'esferas-dragao', 'guildas', 'conquistas', 'loja',
    ];
    expect(WIKI_SECTIONS.map((s) => s.id)).toEqual(expectedIds);
  });

  test('TODAS as seções têm bloco "Em resumo" com 2-3 bullets', () => {
    for (const s of WIKI_SECTIONS) {
      expect(s.resumo.length).toBeGreaterThanOrEqual(2);
      expect(s.resumo.length).toBeLessThanOrEqual(3);
      for (const bullet of s.resumo) {
        expect(bullet.length).toBeGreaterThan(10);
      }
    }
  });

  test('Busca indexa o conteúdo dos blocos expandíveis (details no DOM)', () => {
    // "Quebra de barreira" só existe dentro do details da seção escala-poder
    const t = sectionSearchText(getWikiSection('escala-poder')!);
    expect(t).toContain('quebra de barreira');
    // os parâmetros internos do combate estão no details da seção combate
    expect(sectionSearchText(getWikiSection('combate')!)).toContain('Coeficiente de defesa física');
    // e a curva de custo de treino completa está no details de atributos
    expect(sectionSearchText(getWikiSection('atributos')!)).toContain('Curva de custo de treino');
  });

  test('Nenhuma afirmação corrompida: valores-chave continuam acessíveis no texto', () => {
    // spot-checks de valores que os testes E2E procuram na página renderizada
    expect(wikiText('accoes-custos')).toContain('0 ⚡');
    expect(wikiText('fim-de-luta')).toContain(`${MAX_ROUNDS} rodadas`);
    expect(wikiText('impeto')).toContain('Quebra de Limite');
    expect(wikiText('profissoes')).toContain('1h');
    expect(wikiText('profissoes')).toContain('8h');
    expect(wikiText('profissoes')).toContain('Nível 10');
  });
});
