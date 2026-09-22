// =====================================================================
// ESCALA DE PODER — ASCENSÃO Z (Capítulo 5 do sistema do dono)
// ---------------------------------------------------------------------
// O RPG original do dono usa uma Escala de Poder em vez de números de
// bilhões: 10 categorias, de Mortal Comum (0) a Transcendente (9).
// O jogo traduz o PODER DO SCOUTER (computeDerived) para a escala
// equivalente — mesma linguagem da mesa, sem inflar números.
//
// Regra 5.1 (Diferença de Escala): comparar a escala do atacante com a
// do defensor diz a ordem geral de potência — o jogo expõe isso nas
// cartas de oponentes (ex.: "+2 escalas" = cuidado).
//
// Módulo 100% puro (sem imports de servidor/cliente) — testável.
// =====================================================================

export interface PowerScaleDef {
  /** Nível da escala (0–9) — o MESMO número do livro de regras. */
  index: number;
  /** Nome da categoria (idêntico ao livro). */
  nome: string;
  /** Poder mínimo do visor de fluxo para pertencer à escala. */
  threshold: number;
  emoji: string;
  /** Texto curto de sabor. */
  desc: string;
  /** Classes Tailwind do selo (badge). */
  badge: string;
  /** Classes do gradiente da barra de progresso. */
  bar: string;
}

export const POWER_SCALES: PowerScaleDef[] = [
  {
    index: 0,
    nome: 'Mortal Comum',
    threshold: 0,
    emoji: '🧍',
    desc: 'Ainda longe dos lendários — todo guerreiro começa aqui.',
    badge: 'bg-stone-800/70 text-stone-300 border-stone-600/50',
    bar: 'from-stone-500 to-stone-400',
  },
  {
    index: 1,
    nome: 'Marcial',
    threshold: 120,
    emoji: '🥋',
    desc: 'Artes marciais afiadas; os primeiros torneios já são vencíveis.',
    badge: 'bg-lime-950/70 text-lime-300 border-lime-700/50',
    bar: 'from-lime-600 to-lime-400',
  },
  {
    index: 2,
    nome: 'Super-Humana',
    threshold: 280,
    emoji: '💪',
    desc: 'Força além do limite humano — capangas caem em rodadas.',
    badge: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50',
    bar: 'from-emerald-600 to-emerald-400',
  },
  {
    index: 3,
    nome: 'Guerreiro Planetário',
    threshold: 850,
    emoji: '🌍',
    desc: 'Ameaça para exércitos inteiros; seu nome ecoa entre as estrelas.',
    badge: 'bg-teal-950/70 text-teal-300 border-teal-700/50',
    bar: 'from-teal-600 to-teal-400',
  },
  {
    index: 4,
    nome: 'Guerreiro Estelar',
    threshold: 1800,
    emoji: '⭐',
    desc: 'Poder para enfrentar impérios galácticos de frente.',
    badge: 'bg-cyan-950/70 text-cyan-300 border-cyan-700/50',
    bar: 'from-cyan-600 to-cyan-400',
  },
  {
    index: 5,
    nome: 'Guerreiro Galáctico',
    threshold: 4000,
    emoji: '🌌',
    desc: 'Galáxias inteiras conhecem seus feitos de batalha.',
    badge: 'bg-sky-950/70 text-sky-300 border-sky-700/50',
    bar: 'from-sky-600 to-sky-400',
  },
  {
    index: 6,
    nome: 'Guerreiro Cósmico',
    threshold: 9000,
    emoji: '🌠',
    desc: 'Ordem cósmica de potência — deuses passam a prestar atenção.',
    badge: 'bg-violet-950/70 text-violet-300 border-violet-700/50',
    bar: 'from-violet-600 to-violet-400',
  },
  {
    index: 7,
    nome: 'Divino',
    threshold: 20000,
    emoji: '✨',
    desc: 'Poder de divindade menor; realidades tremem em seus golpes.',
    badge: 'bg-fuchsia-950/70 text-fuchsia-300 border-fuchsia-700/50',
    bar: 'from-fuchsia-600 to-fuchsia-400',
  },
  {
    index: 8,
    nome: 'Deus Maior',
    threshold: 45000,
    emoji: '⚡',
    desc: 'Entre os maiores poderes do multiverso.',
    badge: 'bg-amber-950/70 text-amber-300 border-amber-600/60',
    bar: 'from-amber-500 to-yellow-400',
  },
  {
    index: 9,
    nome: 'Transcendente',
    threshold: 100000,
    emoji: '👑',
    desc: 'Escala máxima — suficiente para conflitos envolvendo universos.',
    badge: 'bg-gradient-to-r from-amber-600/40 to-orange-600/40 text-amber-100 border-amber-500/60',
    bar: 'from-amber-400 via-orange-400 to-red-400',
  },
];

export interface PowerScaleResult {
  scale: PowerScaleDef;
  /** Próxima escala — null no Transcendente (topo). */
  next: PowerScaleDef | null;
  /** Progresso 0–1 rumo à próxima escala. */
  progress: number;
  /** Poder que falta para subir de escala (0 no topo). */
  powerToNext: number;
}

/** Garante um poder válido (número finito ≥ 0; +Infinity sobe ao topo). */
function safePower(power: number): number {
  const v = Number(power);
  if (!Number.isFinite(v)) return v > 0 ? Number.MAX_SAFE_INTEGER : 0;
  return v > 0 ? Math.floor(v) : 0;
}

/**
 * Classifica um poder de visor de fluxo na Escala de Poder (ASCENSÃO Z).
 * Sempre devolve uma escala válida — lixo vira Mortal Comum.
 */
export function getPowerScale(power: number): PowerScaleResult {
  const p = safePower(power);
  let i = 0;
  for (let s = 0; s < POWER_SCALES.length; s++) {
    if (p >= POWER_SCALES[s].threshold) i = s;
  }
  const scale = POWER_SCALES[i];
  const next = i < POWER_SCALES.length - 1 ? POWER_SCALES[i + 1] : null;
  if (!next) return { scale, next: null, progress: 1, powerToNext: 0 };
  const span = next.threshold - scale.threshold;
  const progress = span > 0 ? Math.min(1, Math.max(0, (p - scale.threshold) / span)) : 1;
  return { scale, next, progress, powerToNext: Math.max(0, next.threshold - p) };
}

/**
 * Regra 5.1 — Diferença de Escala entre dois poderes (ordem geral de
 * potência). Positivo = a está ACIMA de b; negativo = abaixo; 0 = igual.
 */
export function scaleDiff(powerA: number, powerB: number): number {
  return getPowerScale(powerA).scale.index - getPowerScale(powerB).scale.index;
}

/**
 * Rótulo pronto para a UI comparar o PODER DO OPONENTE com o do jogador:
 *  • "+2 escalas" (vermelho — perigo, regra 5.1)
 *  • "mesma escala" (neutro)
 *  • "-1 escala" (verde — vantagem)
 */
export function scaleDiffLabel(powerOpponent: number, powerPlayer: number): {
  text: string;
  className: string;
} {
  const diff = scaleDiff(powerOpponent, powerPlayer);
  if (diff === 0) return { text: 'mesma escala', className: 'text-amber-200/60 border-amber-800/40' };
  if (diff > 0) {
    return {
      text: `+${diff} ${diff === 1 ? 'escala' : 'escalas'} acima`,
      className: 'text-red-300 border-red-800/50 bg-red-950/40',
    };
  }
  const a = Math.abs(diff);
  return {
    text: `${a} ${a === 1 ? 'escala' : 'escalas'} abaixo`,
    className: 'text-emerald-300 border-emerald-800/50 bg-emerald-950/40',
  };
}

// =====================================================================
// ARMADURA DE ESCALA NO COMBATE — regras 5.1 e 5.3 (v0.9.12)
// ---------------------------------------------------------------------
// 5.1 (até 3 de diferença): o SUPERIOR causa +1 dano por nível de
// vantagem; o INFERIOR sofre Armadura de Escala (1 ponto por nível)
// que reduz o dano que ele CAUSA. Tradução para os números do jogo
// (dano de dezenas/centenas): +7% por escala de vantagem; −12% por
// nível de armadura, máximo 3 — a proporção preserva a ordem de
// potência sem esmagar o balanceamento existente.
//
// 5.3 (4+ de diferença): básicos do inferior não causam dano
// significativo — golpe ESMAGADO (×0.35). Críticos do azarão geram
// ABERTURAS; com 3 Aberturas, uma TÉCNICA trata a diferença como
// apenas 3 naquele ataque ("quebra de barreira").
//
// 5.2: escala NÃO altera precisão/esquiva (velocidade segue separada) —
// a esquiva existente permanece intacta.
// =====================================================================

export const SCALE_COMBAT = {
  /** Bônus do superior por escala de vantagem (regra 5.1: +1 dano/nível). */
  advantagePerLevel: 0.07,
  /** Redução do dano do inferior por nível de Armadura de Escala. */
  armorPerLevel: 0.12,
  /** "Máximo normal: 3" (regra 5.1). */
  maxDiff: 3,
  /** Regra 5.3: diferença a partir da qual golpes do azarão são esmagados. */
  crushingThreshold: 4,
  /** Multiplicador extra sobre golpes do azarão com diferença ≥ 4. */
  crushingMult: 0.35,
  /** Aberturas acumuladas para uma técnica tratar a diferença como 3. */
  aberturasNeeded: 3,
  /** Multiplicador do dano no crítico de Abertura. */
  aberturaCritMult: 1.75,
} as const;

export interface ScaleCombatRules {
  /** Escalas do DEFENSOR acima do ATACANTE (positivo = atacante abaixo). */
  diff: number;
  /** Armadura de Escala efetiva contra o atacante (min(diff, 3)). */
  armor: number;
  /** Vantagem do atacante (escalas acima do defensor, máx. 3). */
  advantage: number;
  /** Multiplicador líquido do dano do ATACante (regra 5.1). */
  damageMult: number;
  /** Regra 5.3: diferença ≥ 4 — golpes do azarão são esmagados. */
  crushing: boolean;
}

/**
 * Regras 5.1/5.3 prontas para o motor de combate: dado o poder do
 * atacante e do defensor, devolve ajuste de dano e flags narrativas.
 * Módulo puro — a MESMA função alimenta engine, UI e testes.
 */
export function scaleCombatRules(attackerPower: number, defenderPower: number): ScaleCombatRules {
  const diff =
    getPowerScale(defenderPower).scale.index - getPowerScale(attackerPower).scale.index;
  const armor = Math.max(0, Math.min(diff, SCALE_COMBAT.maxDiff));
  const advantage = Math.max(0, Math.min(-diff, SCALE_COMBAT.maxDiff));
  const damageMult = Math.max(
    0.1,
    1 + advantage * SCALE_COMBAT.advantagePerLevel - armor * SCALE_COMBAT.armorPerLevel
  );
  return { diff, armor, advantage, damageMult, crushing: diff >= SCALE_COMBAT.crushingThreshold };
}

/**
 * Chance de ABERTURA (crítico do azarão) — regra 5.3: velocidade
 * afetando a narrativa sem tocar na esquiva (5.2). Azarão mais rápido
 * que o oponente encontra brechas com mais frequência (3%–9%).
 */
export function aberturaChance(attackerSpeed: number, defenderSpeed: number): number {
  const speedEdge = Math.max(-10, Math.min(10, attackerSpeed - defenderSpeed));
  return 0.06 + speedEdge * 0.003;
}
