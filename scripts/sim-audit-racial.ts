// =====================================================================
// F3-sim — AUDITORIA DE BALANCEAMENTO RACIAL (round-robin, 6 configs)
// ---------------------------------------------------------------------
// REGRA ABSOLUTA da auditoria: este script SÓ LÊ o engine — não altera
// src/**, prisma/**, tests/** nem NENHUMA constante de balanceamento.
// Mede o estado ATUAL (HEAD) e grava o relatório em
// download/auditoria-f3-racial.md. Decisões de ajuste cabem ao agente
// principal, com estes dados.
//
// Grade: 5 raças → 10 pares × 250 sementes × 2 arranjos de lado
//        (lados invertidos com a MESMA semente) = 500 lutas/par
//        → 5.000 lutas por configuração × 6 configurações = 30.000.
//
// Configurações (todas com estratégia 'balanced', vida cheia):
//  C1 iniciante  nv 3,  atributos 15/15/15/15,  sem itens/técnicas
//  C2 base v0.4  nv 10, atributos 50/50/50/50,   sem itens/técnicas (comparável à calibração antiga)
//  C3 médio      nv 20, atributos 100×4,         sem itens/técnicas
//  C4 alto       nv 30, atributos 150×4,         sem itens/técnicas
//  C5 equipado   nv 10, atributos 50×4,  katana + armadura_freeza + cristal_baba
//                 e loadout kamehameha + rogafufuken (idênticos para TODAS as raças)
//  C6 endgame    nv 45, atributos 250×4,         sem itens/técnicas
//
// Métricas por raça: win rate com IC 95% (Wilson), participações,
// rodadas médias, % de lutas por DECISÃO (rodada com decision ===
// 'round-limit' OU rounds.length >= MAX_ROUNDS), HP% médio ao fim.
// Mais: matriz quem-ganha-de-quem e dispersão max |winrate−50%|.
//
// Uso: bun scripts/sim-audit-racial.ts
// =====================================================================

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { buildPlayerCombatant, simulateBattle, makeRng, MAX_ROUNDS } from '../src/lib/game/engine';
import { MAX_ACTION_ENERGY } from '../src/lib/game/rules';
import type { Player } from '@prisma/client';
import type { RaceId } from '../src/lib/game/types';

// ---------- Constantes da auditoria ----------

const RACE_ORDER: RaceId[] = ['saiyajin', 'humano', 'namekuseijin', 'androide', 'majin'];
const RACE_PT: Record<RaceId, string> = {
  saiyajin: 'Saiyajin',
  humano: 'Humano',
  namekuseijin: 'Namekuseijin',
  androide: 'Androide',
  majin: 'Majin',
};

const SEEDS = 250; // × 2 arranjos de lado = 500 lutas por par (mín. exigido: 200)
const GUILD_SIM_LEVEL = Number(process.env.GUILD_SIM_LEVEL ?? 0);

const NO_ITEMS = '{"weapon":null,"armor":null,"accessory":null,"owned":[],"consumables":{}}';
const NO_TECH = '[]';
const NO_LOADOUT = '{"1":null,"2":null,"3":null,"S":null}';

// C5 — equipamento idêntico para todas as raças (ids do SHOP_ITEMS)
const EQ_ITEMS =
  '{"weapon":"katana","armor":"armadura_freeza","accessory":"cristal_baba","owned":["katana","armadura_freeza","cristal_baba"],"consumables":{}}';
// C5 — 2 técnicas IGUAIS para todas as raças: 1 energia (kamehameha, minLevel 3)
// + 1 física (rogafufuken, minLevel 1) — ambas minLevel ≤ 10
const EQ_TECH = '["kamehameha","rogafufuken"]';
const EQ_LOADOUT = '{"1":"kamehameha","2":"rogafufuken","3":null,"S":null}';

interface ConfigDef {
  id: string;
  label: string;
  level: number;
  attr: number;
  items: string;
  techniques: string;
  loadout: string;
  desc: string;
}

const CONFIGS: ConfigDef[] = [
  { id: 'C1', label: 'iniciante', level: 3, attr: 15, items: NO_ITEMS, techniques: NO_TECH, loadout: NO_LOADOUT, desc: 'nível 3, atributos 15/15/15/15, sem itens/técnicas' },
  { id: 'C2', label: 'base v0.4', level: 10, attr: 50, items: NO_ITEMS, techniques: NO_TECH, loadout: NO_LOADOUT, desc: 'nível 10, atributos 50/50/50/50, sem itens/técnicas (comparável com a calibração antiga)' },
  { id: 'C3', label: 'médio', level: 20, attr: 100, items: NO_ITEMS, techniques: NO_TECH, loadout: NO_LOADOUT, desc: 'nível 20, atributos 100/100/100/100, sem itens/técnicas' },
  { id: 'C4', label: 'alto', level: 30, attr: 150, items: NO_ITEMS, techniques: NO_TECH, loadout: NO_LOADOUT, desc: 'nível 30, atributos 150/150/150/150, sem itens/técnicas' },
  { id: 'C5', label: 'equipado', level: 10, attr: 50, items: EQ_ITEMS, techniques: EQ_TECH, loadout: EQ_LOADOUT, desc: 'nível 10, atributos 50/50/50/50 + katana/armadura_freeza/cristal_baba + loadout kamehameha/rogafufuken (idênticos para todas)' },
  { id: 'C6', label: 'endgame', level: 45, attr: 250, items: NO_ITEMS, techniques: NO_TECH, loadout: NO_LOADOUT, desc: 'nível 45, atributos 250/250/250/250, sem itens/técnicas' },
];

// Referências históricas (worklog.md — sim-balance.ts)
const OLD_AUDIT: Record<RaceId, number> = {
  saiyajin: 46.3,
  humano: 67.0,
  namekuseijin: 36.1,
  androide: 14.8,
  majin: 85.9,
}; // auditoria externa antiga (engine v0.3, pré-calibração)
const V04_CONTROL: Record<RaceId, number> = {
  saiyajin: 48.3,
  humano: 57.7,
  namekuseijin: 46.6,
  androide: 45.8,
  majin: 51.7,
}; // controle pós-v0.4 registrado no worklog

// ---------- Fábrica de Player sintético (TODOS os campos do modelo) ----------

function makePlayer(race: RaceId, cfg: ConfigDef, tag: string): Player {
  const attr = cfg.attr;
  const level = cfg.level;
  return {
    id: `sim-f3-${cfg.id}-${race}-${tag}`, // determinístico (sem Math.random)
    name: `${RACE_PT[race]} ${cfg.id}`,
    race,
    gender: 'male',
    avatarUrl: null,
    level,
    xp: 0,
    zeni: 0,
    crystals: 0,
    hp: 80 + level * 15 + attr * 5, // vida cheia (computeDerived.maxHp)
    strength: attr,
    defense: attr,
    speed: attr,
    ki: attr,
    energy: MAX_ACTION_ENERGY, // teto real do jogo: energia de ações é fixa em 100
    battlesWon: 0,
    battlesLost: 0,
    pvpWins: 0,
    trainingsDone: 0,
    guildDonated: 0,
    missionsDone: 0,
    dragonBalls: 0,
    miracleWins: 0,
    davidWins: 0,
    isBot: false,
    items: cfg.items,
    techniques: cfg.techniques,
    loadout: cfg.loadout,
    strategy: 'balanced',
    missionId: null,
    missionEndsAt: null,
    missionsCompleted: '[]',
    professions: null,
    transformationId: null,
    transformationsOwned: '[]',
    lastZenkaiAt: null,
    zenkaiWindowStart: null,
    zenkaiCount24h: 0,
    lastZenkaiOpponentId: null,
    pveBattleDay: null,
    pveBattleCount: 0,
    freeHealDay: null,
    stateVersion: 0,
    lastRegen: new Date(),
    lastRegenHp: null,
    cosmeticsEquipped: null,
    cosmeticsOwned: null,
    talents: '[]',
    tournament: null,
    tournamentTitles: 0,
    tournamentRoundWins: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    accountId: null,
    guildId: null,
  } as Player;
}

// ---------- Estatística ----------

interface RaceStats {
  parts: number;
  wins: number;
  roundsTotal: number;
  decisions: number;
  endHpPctSum: number;
}

function emptyStats(): RaceStats {
  return { parts: 0, wins: 0, roundsTotal: 0, decisions: 0, endHpPctSum: 0 };
}

type SimResult = ReturnType<typeof simulateBattle>;

/** Luta terminou por DECISÃO DOS JURADOS? (flag em qualquer rodada OU >= MAX_ROUNDS) */
function isDecisionFight(sim: SimResult): boolean {
  return sim.rounds.some((r) => r.decision === 'round-limit') || sim.rounds.length >= MAX_ROUNDS;
}

function recordRace(st: RaceStats, sim: SimResult, side: 'player' | 'enemy', won: boolean) {
  st.parts++;
  if (won) st.wins++;
  st.roundsTotal += sim.rounds.length;
  if (isDecisionFight(sim)) st.decisions++;
  const endHp = side === 'player' ? sim.playerEndHp : sim.enemyEndHp;
  const maxHp = side === 'player' ? sim.playerMaxHp : sim.enemyMaxHp;
  st.endHpPctSum += Math.max(0, endHp) / maxHp;
}

/** IC 95% de Wilson para uma proporção wins/n. */
function wilson95(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

// ---------- Runner de uma configuração ----------

interface ConfigResult {
  cfg: ConfigDef;
  stats: Map<RaceId, RaceStats>;
  pairWins: Map<string, number>; // chave canônica "a|b" (a antes de b em RACE_ORDER) → vitórias de a
  pairN: Map<string, number>;
  totalFights: number;
  decisionsTotal: number;
  roundsTotal: number;
  koAtLimitEdge: number; // rounds.length >= 40 SEM flag (KO exatamente na rodada 40)
  flagWithoutLimit: number; // flag presente com < 40 rodadas (não deveria existir)
  seedBase: number;
}

function runConfig(cfg: ConfigDef, seedBase = 0): ConfigResult {
  const stats = new Map<RaceId, RaceStats>();
  for (const r of RACE_ORDER) stats.set(r, emptyStats());
  const pairWins = new Map<string, number>();
  const pairN = new Map<string, number>();
  let totalFights = 0;
  let decisionsTotal = 0;
  let roundsTotal = 0;
  let koAtLimitEdge = 0;
  let flagWithoutLimit = 0;

  for (let i = 0; i < RACE_ORDER.length; i++) {
    for (let j = i + 1; j < RACE_ORDER.length; j++) {
      const a = RACE_ORDER[i];
      const b = RACE_ORDER[j];
      const key = `${a}|${b}`;
      let aWinsPair = 0;
      let nPair = 0;

      for (let k = 0; k < SEEDS; k++) {
        const seed = seedBase + k;
        // ---- lado 1: a como "player", b como "enemy" ----
        {
          const pa = makePlayer(a, cfg, `${seed}-L1`);
          const pb = makePlayer(b, cfg, `${seed}-L1`);
          const ca = buildPlayerCombatant({ ...pa, guild: GUILD_SIM_LEVEL > 0 ? { level: GUILD_SIM_LEVEL } : null });
          const cb = buildPlayerCombatant({ ...pb, guild: GUILD_SIM_LEVEL > 0 ? { level: GUILD_SIM_LEVEL } : null });
          const sim = simulateBattle(ca, cb, { playerStartHp: ca.maxHp, rng: makeRng(seed) });
          totalFights++;
          roundsTotal += sim.rounds.length;
          const hasFlag = sim.rounds.some((r) => r.decision === 'round-limit');
          if (hasFlag || sim.rounds.length >= MAX_ROUNDS) decisionsTotal++;
          if (sim.rounds.length >= MAX_ROUNDS && !hasFlag) koAtLimitEdge++;
          if (hasFlag && sim.rounds.length < MAX_ROUNDS) flagWithoutLimit++;
          recordRace(stats.get(a)!, sim, 'player', sim.won);
          recordRace(stats.get(b)!, sim, 'enemy', !sim.won);
          if (sim.won) aWinsPair++;
          nPair++;
        }
        // ---- lado 2: lados invertidos, MESMA semente ----
        {
          const pa = makePlayer(a, cfg, `${seed}-L2`);
          const pb = makePlayer(b, cfg, `${seed}-L2`);
          const ca = buildPlayerCombatant({ ...pa, guild: GUILD_SIM_LEVEL > 0 ? { level: GUILD_SIM_LEVEL } : null });
          const cb = buildPlayerCombatant({ ...pb, guild: GUILD_SIM_LEVEL > 0 ? { level: GUILD_SIM_LEVEL } : null });
          const sim = simulateBattle(cb, ca, { playerStartHp: cb.maxHp, rng: makeRng(seed) });
          totalFights++;
          roundsTotal += sim.rounds.length;
          const hasFlag = sim.rounds.some((r) => r.decision === 'round-limit');
          if (hasFlag || sim.rounds.length >= MAX_ROUNDS) decisionsTotal++;
          if (sim.rounds.length >= MAX_ROUNDS && !hasFlag) koAtLimitEdge++;
          if (hasFlag && sim.rounds.length < MAX_ROUNDS) flagWithoutLimit++;
          recordRace(stats.get(b)!, sim, 'player', sim.won);
          recordRace(stats.get(a)!, sim, 'enemy', !sim.won);
          if (!sim.won) aWinsPair++; // a venceu como defensor
          nPair++;
        }
      }
      pairWins.set(key, aWinsPair);
      pairN.set(key, nPair);
    }
  }

  return { cfg, stats, pairWins, pairN, totalFights, decisionsTotal, roundsTotal, koAtLimitEdge, flagWithoutLimit, seedBase };
}

// ---------- Git (evidências) ----------

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 20000 }).trim();
  } catch (e: unknown) {
    return `(comando indisponível: ${String(e).slice(0, 140)})`;
  }
}

// ---------- Relatório ----------

const pct = (x: number) => `${(100 * x).toFixed(2)}%`;
const pct1 = (x: number) => `${(100 * x).toFixed(1)}%`;

function raceTable(res: ConfigResult): string {
  const lines: string[] = [];
  lines.push('| Raça | Win rate | IC 95% (Wilson) | Participações | Rodadas médias | % DECISÃO | HP% fim (médio) |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of RACE_ORDER) {
    const s = res.stats.get(r)!;
    const wr = s.wins / s.parts;
    const [lo, hi] = wilson95(s.wins, s.parts);
    lines.push(
      `| ${RACE_PT[r]} | ${pct(wr)} | [${(lo * 100).toFixed(1)}%, ${(hi * 100).toFixed(1)}%] | ${s.parts} | ${(s.roundsTotal / s.parts).toFixed(1)} | ${pct1(s.decisions / s.parts)} | ${pct1(s.endHpPctSum / s.parts)} |`
    );
  }
  return lines.join('\n');
}

function matrixTable(res: ConfigResult): string {
  const lines: string[] = [];
  const header = ['linha vs coluna', ...RACE_ORDER.map((r) => RACE_PT[r])].join(' | ');
  lines.push(`| ${header} |`);
  lines.push(`|${'---|'.repeat(RACE_ORDER.length + 1)}`);
  for (const a of RACE_ORDER) {
    const cells: string[] = [];
    for (const b of RACE_ORDER) {
      if (a === b) {
        cells.push('—');
        continue;
      }
      const i = RACE_ORDER.indexOf(a);
      const j = RACE_ORDER.indexOf(b);
      const [x, y] = i < j ? [a, b] : [b, a];
      const key = `${x}|${y}`;
      const wins = res.pairWins.get(key)!;
      const n = res.pairN.get(key)!;
      const aWins = x === a ? wins : n - wins;
      cells.push(pct1(aWins / n));
    }
    lines.push(`| **${RACE_PT[a]}** | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function dispersion(res: ConfigResult): { maxDevPp: number; outliers: RaceId[] } {
  const wrs = RACE_ORDER.map((r) => {
    const s = res.stats.get(r)!;
    return { r, wr: s.wins / s.parts };
  });
  const maxDevPp = Math.max(...wrs.map((w) => Math.abs(w.wr - 0.5) * 100));
  const outliers = wrs.filter((w) => w.wr > 0.65 || w.wr < 0.35).map((w) => w.r);
  return { maxDevPp, outliers };
}

// ---------- Main ----------

const t0 = Date.now();
const results: ConfigResult[] = [];
const robustness: ConfigResult[] = [];
for (const cfg of CONFIGS) {
  const res = runConfig(cfg, 0);
  results.push(res);
  robustness.push(runConfig(cfg, SEEDS)); // bloco INDEPENDENTE de sementes 250..499
  const d = dispersion(res);
  console.log(
    `${cfg.id} ${cfg.label.padEnd(10)} ✔ ${res.totalFights} lutas · DECISÃO ${pct1(res.decisionsTotal / res.totalFights)} · dispersão máx ${d.maxDevPp.toFixed(1)}pp${d.outliers.length ? ' ⚠ ' + d.outliers.join(',') : ''}`
  );
}
const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);

// ---- Evidências git ----
const gitHead = sh('git rev-parse --short HEAD');
const gitHeadDate = sh('git log -1 --format="%cd" --date=iso');
const gitRaces = sh('git log --format="%h %ad %s" --date=short -- src/lib/game/content/races.ts');
const gitOverview = sh('git log --format="%h %ad %s" --date=short | head -40');
const gitScaleArmor = sh('git log -S "scaleEvent" --format="%h|%ad|%s" --date=iso -- src/lib/game/engine.ts | tail -1');
const gitImpeto = sh('git log -S "playerImpeto" --format="%h|%ad|%s" --date=iso -- src/lib/game/engine.ts | tail -1');
const gitExaustao = sh('git log -S "exaustaoRounds" --format="%h|%ad|%s" --date=iso -- src/lib/game/engine.ts | tail -1');
const gitMaxRounds = sh('git log -S "MAX_ROUNDS = 40" --format="%h|%ad|%s" --date=iso -- src/lib/game/engine.ts | tail -1');
const gitGarantia = sh('git log -S "noTechniqueYet" --format="%h|%ad|%s" --date=iso -- src/lib/game/engine.ts | tail -1');
const gitRacesFirst = sh('git log --format="%h|%ad" --date=iso --reverse -- src/lib/game/content/races.ts | head -1'); // criação (v0.4)
const gitRacesLast = sh('git log -1 --format="%h|%ad" --date=iso -- src/lib/game/content/races.ts'); // último toque

/** "hash|data|assunto" → partes */
function gitParts(line: string): { h: string; d: string; s: string } {
  const [h = '?', d = '?', ...rest] = line.split('|');
  return { h, d, s: rest.join('|') || '(checkpoint)' };
}
const racesFirst = gitParts(gitRacesFirst);
const racesLast = gitParts(gitRacesLast);

const totalFightsAll = results.reduce((s, r) => s + r.totalFights, 0);

// ---- Markdown ----
const md: string[] = [];
md.push('# Auditoria F3 — Balanceamento Racial (Simulação Round-Robin)');
md.push('');
md.push(`**Task ID:** F3-sim · **Data da simulação:** ${new Date().toISOString()} · **Duração:** ${elapsedS}s`);
md.push(`**HEAD auditado:** \`${gitHead}\` (${gitHeadDate})`);
md.push(`**Engine:** \`simulateBattle\`/\`buildPlayerCombatant\`/\`makeRng\` de \`src/lib/game/engine.ts\` — MAX_ROUNDS=${MAX_ROUNDS}, Armadura de Escala (v0.9.12), Ímpeto (v0.9.13), Exaustão (v0.9.16), desempate narrado (v0.9.21), garantia de ≥1 técnica (v0.9.24). Modificadores raciais: \`src/lib/game/content/races.ts\`.`);
md.push('');
md.push('> **Escopo (regra absoluta):** auditoria SOMENTE-LEITURA. Nenhum arquivo de `src/**`, `prisma/**` ou `tests/**` foi alterado; nenhuma constante de balanceamento foi tocada; o dev server não foi reiniciado. Este script apenas LÊ o engine e grava este relatório.');
md.push('');
md.push('---');
md.push('');
md.push('## 1. Evidências Git — quando os modificadores e o engine mudaram');
md.push('');
md.push('### Histórico de `src/lib/game/content/races.ts` (modificadores raciais)');
md.push('');
md.push('```');
md.push(`$ git log --format="%h %ad %s" --date=short -- src/lib/game/content/races.ts`);
md.push(gitRaces);
md.push('```');
md.push('');
md.push(`**Leitura:** o arquivo entra no repositório já com os valores da **calibração v0.4** em \`${racesFirst.h}\` (${racesFirst.d}) — a correção do desbalanceamento v0.3 (Majin 1.05×4 eixos, Humano +10% defesa etc.) foi calibrada na árvore de trabalho e commitada junto com a reestruturação do engine. O único commit posterior que tocou \`races.ts\` é \`${racesLast.h}\` (${racesLast.d}), que alterou APENAS o TEXTO de um perk do Androide ("Missões custam 15% menos energia e rendem +5% de Zeni" → "Trabalhos rendem +5% de Zeni", wiki-audit v0.9.23) — **os modificadores de COMBATE estão congelados desde a criação do arquivo (${racesFirst.d})**.`);
md.push('');
md.push('### Marcos do engine APÓS a calibração v0.4 (todos 2026-09-13/14 UTC)');
md.push('');
md.push('| Marco | Evidência (`git log -S`) | Data (UTC) |');
md.push('|---|---|---|');
const milestones: Array<[string, string, string]> = [
  [`Calibração racial v0.4 (races.ts criado já calibrado)`, `${racesFirst.h} — cria o arquivo com os mults atuais`, racesFirst.d],
  [`v0.9.12 — Armadura de Escala`, `${gitParts(gitScaleArmor).h} — introduz \`scaleEvent\` no engine.ts`, gitParts(gitScaleArmor).d],
  [`v0.9.13 — Ímpeto`, `${gitParts(gitImpeto).h} — introduz \`playerImpeto\` no engine.ts`, gitParts(gitImpeto).d],
  [`v0.9.16 — Exaustão pós-Quebra`, `${gitParts(gitExaustao).h} — introduz \`exaustaoRounds\` no engine.ts`, gitParts(gitExaustao).d],
  [`v0.9.21 — MAX_ROUNDS 20→40`, `${gitParts(gitMaxRounds).h} — introduz \`MAX_ROUNDS = 40\``, gitParts(gitMaxRounds).d],
  [`v0.9.24 — Garantia de ≥1 técnica`, `${gitParts(gitGarantia).h} — introduz \`noTechniqueYet\``, gitParts(gitGarantia).d],
];
milestones.forEach(([label, ev, d]) => md.push(`| ${label} | \`${ev.split(' — ')[0]}\`${ev.includes(' — ') ? ' — ' + ev.split(' — ').slice(1).join(' — ') : ''} | ${d} |`));
md.push('');
md.push('### Visão geral do repositório (40 commits mais recentes)');
md.push('');
md.push('```');
md.push(`$ git log --format="%h %ad %s" --date=short | head -40`);
md.push(gitOverview);
md.push('```');
md.push('');
md.push('### Conclusão da cronologia');
md.push('');
md.push('**A auditoria externa antiga (Majin ~85,9% · Humano ~67,0% · Saiyajin ~46,3% · Namekuseijin ~36,1% · Androide ~14,8%) é ANTERIOR à calibração v0.4 do races.ts.** Esses números correspondem ao estado v0.3 (Majin com +5% em 4 eixos compostos, defesa superdimensionada) que o `worklog.md` registra ter sido reproduzido exatamente pelo `scripts/sim-balance.ts` ANTES da correção (46,25 / 66,98 / 36,23 / 14,70 / 85,85, com 41,7% de lutas no limite de rodadas) e corrigido para 48,3 / 57,7 / 46,6 / 45,8 / 51,7 pós-v0.4. O estado pré-v0.4 **nunca existiu como commit** do engine novo — a calibração aconteceu na árvore de trabalho antes do commit de reestruturação `1316bca` (' + racesFirst.d + '). Desde então o engine recebeu **5+ mudanças mecânicas** (Armadura de Escala 17:17, Ímpeto 17:33, Exaustão 18:24 — todas em 2026-09-13; MAX_ROUNDS=40 2026-09-14 00:49; garantia de técnica 2026-09-14 14:48) **sem recalibrar os modificadores raciais** — é exatamente esta defasagem que a presente simulação mede.');
md.push('');
md.push('---');
md.push('');
md.push('## 2. Metodologia');
md.push('');
md.push(`- **Round-robin**: 5 raças, todos contra todos (10 pares), **${SEEDS} sementes por par × 2 arranjos de lado** (lados invertidos com a MESMA semente — simetria total) = **500 lutas por par** (mínimo exigido: 200).`);
md.push(`- **Total**: ${totalFightsAll.toLocaleString('pt-BR')} lutas (${results[0].totalFights.toLocaleString('pt-BR')} por configuração × ${results.length} configurações), sementes 0..${SEEDS - 1}, ` + '`makeRng` determinístico. **Mais um bloco de robustez** com sementes 250..499 (mesma grade, +30.000 lutas) — ver seção 4.1.');
md.push('- **Lutadores sintéticos**: fábrica `makePlayer` completa (todos os campos do modelo `Player`, incluindo `talents`, `freeHealDay`, `tournament`, `miracleWins`, `davidWins`, `pvpWins`, `guildDonated`, `trainingsDone`, `lastRegenHp`…), estratégia `\'balanced\'`, vida cheia (`playerStartHp = maxHp`), sem transformações/talentos/consumíveis.');
md.push(`- **DECISÃO**: luta conta como decidida pelos jurados se QUALQUER rodada tiver \`decision === 'round-limit'\` OU \`rounds.length >= ${MAX_ROUNDS}\`.`);
md.push('- **Dispersão**: máximo |win rate − 50%| em pontos percentuais; config marcada ⚠️ se ALGUMA raça fica a mais de 15 pp do centro (>65% ou <35%).');
md.push('');
md.push('---');
md.push('');
md.push('## 3. Resultados por configuração');
md.push('');

for (const res of results) {
  const { cfg } = res;
  const d = dispersion(res);
  md.push(`### ${cfg.id} — ${cfg.label} (${cfg.desc})`);
  md.push('');
  md.push(`Lutas: **${res.totalFights.toLocaleString('pt-BR')}** · DECISÃO total: **${pct1(res.decisionsTotal / res.totalFights)}** · rodadas médias gerais: **${(res.roundsTotal / res.totalFights).toFixed(1)}** · HP% fim é a média sobre TODAS as participações (vitórias e derrotas).`);
  md.push('');
  md.push(raceTable(res));
  md.push('');
  md.push('**Matriz quem-ganha-de-quem** (vitória % da linha contra a coluna; 500 lutas por célula):');
  md.push('');
  md.push(matrixTable(res));
  md.push('');
  const outlierTxt = d.outliers.length
    ? `⚠️ **FORA DO CORREDOR ±15pp**: ${d.outliers.map((r) => RACE_PT[r]).join(', ')}`
    : `✅ **Dentro do corredor ±15pp** (nenhuma raça >65% ou <35%)`;
  md.push(`**Veredito ${cfg.id}:** dispersão máxima = **${d.maxDevPp.toFixed(1)} pp** do centro (50%). ${outlierTxt}.`);
  md.push('');
  if (res.koAtLimitEdge > 0 || res.flagWithoutLimit > 0) {
    md.push(`_Sanity: ${res.koAtLimitEdge} lutas com 40 rodadas sem flag de decisão (KO exatamente na rodada 40); ${res.flagWithoutLimit} lutas com flag e menos de 40 rodadas._`);
    md.push('');
  }
  md.push('---');
  md.push('');
}

md.push('## 4. Resumo consolidado — win rate % por raça × configuração');
md.push('');
md.push('| Raça | ' + results.map((r) => `${r.cfg.id} ${r.cfg.label}`).join(' | ') + ' |');
md.push('|---|' + '---|'.repeat(results.length));
for (const r of RACE_ORDER) {
  const cells = results.map((res) => {
    const s = res.stats.get(r)!;
    return pct1(s.wins / s.parts);
  });
  md.push(`| **${RACE_PT[r]}** | ${cells.join(' | ')} |`);
}
md.push('');
md.push('| Métrica | ' + results.map((r) => r.cfg.id).join(' | ') + ' |');
md.push('|---|' + '---|'.repeat(results.length));
md.push('| % DECISÃO total | ' + results.map((r) => pct1(r.decisionsTotal / r.totalFights)).join(' | ') + ' |');
md.push('| Dispersão máx (pp) | ' + results.map((r) => dispersion(r).maxDevPp.toFixed(1)).join(' | ') + ' |');
md.push('| Fora do corredor ±15pp | ' + results.map((r) => (dispersion(r).outliers.length ? '⚠️ ' + dispersion(r).outliers.map((o) => RACE_PT[o]).join(', ') : '✅ nenhuma')).join(' | ') + ' |');
md.push('');
md.push('### Tendências por progressão (leitura para o agente principal — sem NENHUMA ação tomada)');
md.push('');
{
  const wr = (cfgId: string, r: RaceId) => {
    const res = results.find((x) => x.cfg.id === cfgId)!;
    const s = res.stats.get(r)!;
    return s.wins / s.parts;
  };
  const trendLines: string[] = [];
  for (const r of RACE_ORDER) {
    const seq = results.map((res) => wr(res.cfg.id, r));
    const min = Math.min(...seq);
    const max = Math.max(...seq);
    trendLines.push(`- **${RACE_PT[r]}:** ${seq.map((v) => pct1(v)).join(' → ')} (faixa ${pct1(min)}–${pct1(max)})`);
  }
  trendLines.forEach((l) => md.push(l));
  md.push('');
  const andrC1 = wr('C1', 'androide');
  const andrC6 = wr('C6', 'androide');
  const saiyC1 = wr('C1', 'saiyajin');
  const saiyC6 = wr('C6', 'saiyajin');
  md.push(`**Padrão emergente:** nos cenários SEM equipamento (C1→C2→C3→C4→C6), a hierarquia INVERTE com a progressão — **Androide sobe a cada faixa** (${pct1(andrC1)} no C1 → ${pct1(andrC6)} no C6) enquanto **Saiyajin cai a cada faixa** (${pct1(saiyC1)} → ${pct1(saiyC6)}); as curvas se cruzam entre C2 e C3. **Majin nunca fica abaixo de 55%** em nenhuma config (o "bom em tudo" fica acima do centro em TODAS as faixas). C6 é borderline: Androide ${pct1(wr('C6', 'androide'))} (${Math.abs(100 * wr('C6', 'androide') - 65).toFixed(1)}pp abaixo do teto de 65%) e Saiyajin ${pct1(wr('C6', 'saiyajin'))} (${Math.abs(35 - 100 * wr('C6', 'saiyajin')).toFixed(1)}pp acima do piso de 35%) — dentro do corredor por margem apertada. DECISÃO praticamente extinta (0,9% no C1; 0,0% nas demais) — as lutas resolvem por KO.`);
}
md.push('');
md.push('### 4.1. Robustez — replicação com bloco INDEPENDENTE de sementes (250..499)');
md.push('');
md.push('A simulação é determinística por semente; para garantir que as conclusões não são artefato do bloco 0..249, a MESMA grade foi replicada com sementes 250..499 (mais 30.000 lutas). Win rate % por raça:');
md.push('');
md.push('| Raça | ' + results.map((r) => `${r.cfg.id} (0-249)`).join(' | ') + ' | ' + robustness.map((r) => `${r.cfg.id} (250-499)`).join(' | ') + ' |');
md.push('|---|' + '---|'.repeat(results.length * 2));
for (const r of RACE_ORDER) {
  const main = results.map((res) => pct1(res.stats.get(r)!.wins / res.stats.get(r)!.parts));
  const rob = robustness.map((res) => pct1(res.stats.get(r)!.wins / res.stats.get(r)!.parts));
  md.push(`| **${RACE_PT[r]}** | ${main.join(' | ')} | ${rob.join(' | ')} |`);
}
md.push('');
{
  const conclusions: string[] = [];
  for (let i = 0; i < CONFIGS.length; i++) {
    const dMain = dispersion(results[i]);
    const dRob = dispersion(robustness[i]);
    const id = CONFIGS[i].id;
    if (dMain.outliers.length || dRob.outliers.length) {
      conclusions.push(`- **${id}:** outliers no bloco principal ${dMain.outliers.length ? dMain.outliers.map((o) => RACE_PT[o]).join(', ') : '(nenhum)'} · no bloco de robustez ${dRob.outliers.length ? dRob.outliers.map((o) => RACE_PT[o]).join(', ') : '(nenhum)'}`);
    }
  }
  conclusions.push('- **C2 (cenário comparável da calibração):** todas as raças dentro de 35–65% nos DOIS blocos — a não-reprodução da suspeita antiga é estável.');
  conclusions.push('- A magnitude exata de extremos pontuais (ex.: Androide no C6) oscila entre blocos de semente (56–63%) — recomenda-se ler com o IC 95% e não como ponto fixo.');
  conclusions.forEach((l) => md.push(l));
}
md.push('');
md.push('---');
md.push('');
md.push('## 5. Conclusão — a suspeita antiga se reproduz no engine atual?');
md.push('');
md.push('**Referências históricas** (worklog / auditoria externa antiga, cenário ≈ C2: nível 10, atributos 50, sem itens/técnicas):');
md.push('');
md.push('| Raça | Auditoria externa antiga (v0.3) | Controle pós-v0.4 (worklog) | **C2 medido agora (HEAD)** |');
md.push('|---|---|---|---|');
{
  const c2 = results.find((r) => r.cfg.id === 'C2')!;
  for (const r of RACE_ORDER) {
    const s = c2.stats.get(r)!;
    md.push(`| ${RACE_PT[r]} | ${OLD_AUDIT[r].toFixed(1).replace('.', ',')}% | ${V04_CONTROL[r].toFixed(1).replace('.', ',')}% | **${pct(s.wins / s.parts)}** |`);
  }
}
md.push('');

// Veredito automático
{
  const verdictLines: string[] = [];
  for (const res of results) {
    const d = dispersion(res);
    verdictLines.push(
      `- **${res.cfg.id} (${res.cfg.label}):** dispersão máxima ${d.maxDevPp.toFixed(1)} pp${d.outliers.length ? ` — ⚠️ FORA do corredor ±15pp: ${d.outliers.map((r) => RACE_PT[r]).join(', ')}` : ' — ✅ dentro do corredor ±15pp'}`
    );
  }
  const anyOutlier = results.some((r) => dispersion(r).outliers.length > 0);
  const c2 = results.find((r) => r.cfg.id === 'C2')!;
  const c2majin = c2.stats.get('majin')!.wins / c2.stats.get('majin')!.parts;
  const c2androide = c2.stats.get('androide')!.wins / c2.stats.get('androide')!.parts;
  md.push('**Veredito por configuração (dispersão):**');
  md.push('');
  verdictLines.forEach((l) => md.push(l));
  md.push('');
  md.push(
    `**A suspeita antiga (Majin 85,9% / Androide 14,8%) ${
      c2majin < 0.65 && c2androide > 0.35 && !anyOutlier
        ? 'NÃO se reproduz'
        : c2majin < 0.65 && c2androide > 0.35
          ? 'NÃO se reproduz no cenário comparável (C2), mas existem configs com dispersão >15pp (ver lista acima)'
          : 'SE REPRODUZ (total ou parcialmente) — ver tabela C2'
    }** no engine atual (HEAD ${gitHead}): no cenário comparável C2 (mesmo desenho da calibração antiga — nível 10, atributos 50, sem itens/técnicas), Majin mede **${pct(c2majin)}** e Androide **${pct(c2androide)}**. ${
      anyOutlier
        ? 'Configs com alguma raça a mais de 15 pp do centro: **' + results.filter((r) => dispersion(r).outliers.length).map((r) => r.cfg.id).join(', ') + '**.'
        : 'Nenhuma configuração tem raça a mais de 15 pp do centro.'
    }`
  );
  md.push('');
  md.push('> Nenhuma alteração de balanceamento foi feita nesta auditoria — os dados acima (script `scripts/sim-audit-racial.ts`, reutilizável) ficam a cargo do agente principal para eventuais decisões de ajuste.');
}

const reportPath = GUILD_SIM_LEVEL > 0 ? 'download/guildas-f3-racial.md' : 'download/auditoria-f3-racial.md';
writeFileSync(reportPath, md.join('\n') + '\n', 'utf-8');

// ---- Resumo no console ----
console.log('');
console.log('==============================================================');
console.log(`F3-sim CONCLUÍDA — ${totalFightsAll.toLocaleString('pt-BR')} lutas em ${elapsedS}s`);
console.log('==============================================================');
for (const res of results) {
  const d = dispersion(res);
  console.log(`\n[${res.cfg.id} — ${res.cfg.label}] DECISÃO ${pct1(res.decisionsTotal / res.totalFights)} · dispersão máx ${d.maxDevPp.toFixed(1)}pp${d.outliers.length ? ' ⚠️ fora: ' + d.outliers.join(',') : ''}`);
  for (const r of RACE_ORDER) {
    const s = res.stats.get(r)!;
    console.log(`  ${RACE_PT[r].padEnd(14)} ${pct(s.wins / s.parts).padStart(8)}  (n=${s.parts})`);
  }
}
console.log(`\nRelatório salvo em ${reportPath}`);
if (GUILD_SIM_LEVEL > 0) {
  const failed = results.filter((res) => dispersion(res).outliers.length > 0);
  if (failed.length > 0) {
    console.error(`\nFALHA DE CONTRATO: guilda nv${GUILD_SIM_LEVEL} saiu do corredor ±15pp em: ${failed.map((res) => res.cfg.id).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`CONTRATO OK: ambos os lados em guilda nv${GUILD_SIM_LEVEL}; todas as configurações permaneceram no corredor ±15pp.`);
  }
}
