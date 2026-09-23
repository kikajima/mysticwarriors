// =====================================================================
// ÍMPETO — ESCALAS DE CAELUM (Capítulo 7) + QUEBRA DE LIMITE (Capítulo 29)
// ---------------------------------------------------------------------
// Ímpeto é o recurso dramático do combate: adrenalina, rivalidade,
// determinação e viradas. No RPG de mesa o dono acumula/gasta à mão;
// no auto-battler a MESMA economia é simulada por gatilhos objetivos
// (receber golpe forte, crítico, cair abaixo da metade da vida) e
// gastos determinísticos (Defesa Heroica, Estender Combo e Quebra de
// Limite) — sem consumir rng: o determinismo dos testes permanece.
//
// Regras do livro traduzidas:
//  • Máximo 6 Ímpetos; combates começam com 1;
//  • Espírito de Superação: enfrentar alguém ≥1 Escala acima → +1
//    no início do combate (herança Solaris, adotada como regra geral
//    do azarão para gerar as viradas "David vs Golias" do sistema);
//  • Ganhos (uma vez por gatilho por rodada): receber golpe poderoso,
//    obter crítico (Abertura), cair abaixo da metade da Vida (1×/luta);
//  • Gastos: 1 = estender combo; 2 = defesa heroica; 3 = Quebra de
//    Limite;
//  • "Ataques adicionais não geram Ímpeto" — os golpes extras do
//    combo não dão ganhos ao ATACANTE (o defensor segue podendo ganhar
//    pelo gatilho dele, uma vez por rodada);
//  • Quebra de Limite (1×/combate, 3 Ímpetos + Ki): luta por 2 rodadas
//    com +1 Escala — o teste ESP+Disciplina do livro é representado
//    pelo próprio custo acumulado (adaptação documentada; falhas/
//    Exaustão ficam para mecânicas futuras).
//
// Módulo 100% puro (sem imports de servidor/cliente) — testável.
// =====================================================================

import { getPowerScale, POWER_SCALES } from './powerScale';

export const IMPETO = {
  /** "Máximo: 6 Ímpetos" (Cap. 7). */
  max: 6,
  /** "Personagens começam normalmente um combate importante com 1 Ímpeto". */
  start: 1,
  /** GATILHO — receber um golpe poderoso: dano final ≥ 18% do HP máximo. */
  heavyBlowPct: 0.18,
  /** GATILHO — cair abaixo da metade da Vida (uma vez por combate). */
  halfHpOnce: true,
  /** GASTO 1 Ímpeto — Estender Combo: outro ataque imediato. */
  comboCost: 1,
  /** "Cada ataque adicional sofre −2 cumulativo" → −25% por golpe extra. */
  comboDamageDecay: 0.75,
  /** "Máximo normal: 3 ataques totais no combo". */
  comboMaxAttacks: 3,
  /** "Ataques adicionais não geram Ímpeto". */
  comboExtraGivesAttackerImpeto: false,
  /** GASTO 2 Ímpetos — Defesa Heroica: golpe poderoso pela metade. */
  heroicDefenseCost: 2,
  heroicDefenseMult: 0.5,
  /** GASTO 3 Ímpetos — Quebra de Limite (uma vez por combate). */
  quebraCost: 3,
  /** "Duração: 2 rodadas". */
  quebraRounds: 2,
  /** Benefício escolhido: "+1 Escala" (o mais icônico da lista do Cap. 29). */
  quebraScaleBonus: 1,
  /** Custo em Ki de batalha (livro: "3 Ki"; motor: unidades de batalha). */
  quebraKiCost: 30,
  /** Ativa quando a Vida cai abaixo de 50% (drama da virada). */
  quebraHpThreshold: 0.5,
  // v0.9.16 — EXAUSTÃO PÓS-QUEBRA (Cap. 29: "Exaustão 2")
  /** "Exaustão 2": 2 rodadas de fadiga após o efeito da Quebra expirar. */
  exaustaoRounds: 2,
  /** Fadiga enfraquece os golpes de quem rompeu os limites (×0.85). */
  exaustaoDamageDealtMult: 0.85,
  /** Fadiga deixa as reações lentas: dano recebido ×1.10. */
  exaustaoDamageTakenMult: 1.1,
  // v0.9.15 — TALENTOS (Cap. 7, gastos restantes de 1 Ímpeto)
  /** GASTO 1 Ímpeto — Repetição do Destino: repete o teste de acerto. */
  rerollCost: 1,
  /** GASTO 1 Ímpeto — Reposicionamento Dramático: esquiva extra. */
  repositionCost: 1,
  /** Bônus da esquiva extra do Reposicionamento (sobre a chance base). */
  repositionDodgeBonus: 0.15,
  /** Teto da chance da esquiva extra (garante risco do 1 Ímpeto). */
  repositionDodgeCap: 0.55,
  // v0.9.17 — TALENTO "Segundo Vento" (Cap. 29: o contragolpe à Exaustão)
  /** GASTO 2 Ímpetos — Segundo Vento: cancela a Exaustão pós-Quebra. */
  segundoVentoCost: 2,
} as const;

/**
 * Política de gasto de Ímpeto por ESTRATÉGIA de combate — estilos
 * agressivos encadeiam combos com menos Ímpeto em caixa; estilos
 * contidos poupam para a Defesa Heroica/Quebra de Limite.
 */
export const IMPETO_COMBO_THRESHOLD: Record<string, number> = {
  aggressive: 1,
  melee: 1,
  balanced: 2,
  ki_specialist: 2,
  defensive: 3,
};

/** Limite de Ímpeto por gatilho/rodada (nunca excede o máximo do Cap. 7). */
export function clampImpeto(value: number): number {
  const v = Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(IMPETO.max, v));
}

/** Um golpe é "poderoso" (gatilho de ganho) com base no dano FINAL? */
export function isHeavyBlow(damage: number, receiverMaxHp: number): boolean {
  if (receiverMaxHp <= 0) return false;
  return damage >= receiverMaxHp * IMPETO.heavyBlowPct;
}

/**
 * Quebra de Limite — poder efetivo para a ESCALA durante o efeito:
 * +1 Escala significa lutar no PATAMAR MÍNIMO da escala seguinte
 * (a escala é uma função degrau do poder do Visor de Fluxo).
 */
export function effectiveScalePower(power: number, quebraActive: boolean): number {
  if (!quebraActive) return power;
  const idx = getPowerScale(power).scale.index + IMPETO.quebraScaleBonus;
  const bumped = Math.min(POWER_SCALES.length - 1, idx);
  return Math.max(power, POWER_SCALES[bumped].threshold);
}
