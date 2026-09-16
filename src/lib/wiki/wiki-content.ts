// =====================================================================
// WIKI DE MECÂNICAS — FONTE ÚNICA DE CONTEÚDO (v0.9.23 — auditoria total)
// ---------------------------------------------------------------------
// Todo o texto da wiki vive AQUI. Para adicionar uma mecânica nova no
// futuro, edite ESTE arquivo (nova WikiSection no array WIKI_SECTIONS)
// — nada mais precisa ser tocado.
//
// POLÍTICA DE NÚMEROS (após auditoria v0.9.23):
//  * Tabelas e exemplos numéricos são DERIVADOS dos módulos puros de
//    conteúdo (content/*, powerScale, impeto) — importando as constantes
//    reais, os números da wiki NUNCA divergem do jogo;
//  * Constantes de módulos server-only (engine.ts, worldboss.ts) são
//    replicadas aqui com comentário `ORIGEM:` — e VALIDADAS pelo teste
//    de contrato tests/wiki-contract.test.ts contra as funções reais;
//  * AUDITORIA v0.9.23: constantes MORTAS no caminho de execução não
//    contam como fonte (ex.: profissões não gastam energia desde a v0.9 —
//    a antiga constante PROFESSION_ENERGY_COST ficou órfã e foi removida
//    daqui). Regra: um número só entra na wiki se o HANDLER cobra hoje.
//
// ESTRUTURA DE LEITURA (UX v0.9.23):
//  * Cada seção abre com `resumo` (2-3 bullets simples — "Em resumo");
//  * O corpo fala com o JOGADOR (2ª pessoa, vocabulário Dragon Ball);
//  * Fórmulas exatas e tabelas completas vivem em blocos `details`
//    ("Detalhes para curiosos") — ficam no DOM e são indexados pela
//    busca, sem entupir a leitura.
//
// Sintaxe de rich-text dos blocos `text`:
//  * [[id-da-secao|Texto]]  → link interno (âncora) para outra seção;
//  * `código`               → trecho monoespaçado;
//  * **negrito**            → destaque.
// =====================================================================

import { RACES } from '@/lib/game/content/races';
import { TECHNIQUES, TRAINING_MASTERS, STRATEGY_LIST } from '@/lib/game/content/techniques';
import { TRANSFORMATIONS } from '@/lib/game/content/transformations';
import {
  TOURNAMENT_ROUNDS,
  QUARTAS_FIGHTERS,
  SEMI_FIGHTERS,
  FINAL_FIGHTERS,
  TOURNAMENT_COOLDOWN_MS,
  TOURNAMENT_ENTRY_FEE,
} from '@/lib/game/content/tournament';
import { ACHIEVEMENTS, DAILY_QUESTS, WEEKLY_QUESTS } from '@/lib/game/content/quests';
import { TALENTS } from '@/lib/game/content/talents';
import {
  ENEMIES,
  SHOP_ITEMS,
  PROFESSIONS,
  PROFESSION_RANKS,
  REGEN,
  HEAL_COST_PER_HP,
  TRAIN_ENERGY_COST,
  BATTLE_ENERGY_COST,
  PVP_LEVEL_RANGE,
  MAX_CHARACTERS_PER_ACCOUNT,
  GUILD_CREATION_COST,
  SELL_PRICE_RATIO,
  xpToNextLevel,
  baseTrainingCost,
} from '@/lib/game/content/world';
import { POWER_SCALES, SCALE_COMBAT } from '@/lib/game/powerScale';
import { IMPETO, IMPETO_COMBO_THRESHOLD } from '@/lib/game/impeto';

// ---------------------------------------------------------------------
// Constantes replicadas de módulos server-only (ORIGEM indicada).
// O TESTE DE CONTRATO (tests/wiki-contract.test.ts) valida cada uma
// contra o código real — mudou lá, o teste quebra e obriga a wiki
// a ser atualizada junto.
// ---------------------------------------------------------------------

/** ORIGEM: src/lib/game/engine.ts — MAX_ROUNDS (v0.9.21: 20→40). */
const MAX_ROUNDS = 40;
/** ORIGEM: src/lib/game/engine.ts — COMBAT (parâmetros centrais v0.4). */
const COMBAT = {
  variance: 0.15,
  maxMitigationPct: 0.8,
  physDefCoef: 0.78,
  energyDefCoef: 0.74,
  kiRegenPerRound: 0.08,
} as const;
/** ORIGEM: src/lib/game/engine.ts — BASIC_ENERGY_KI_COST. */
const BASIC_ENERGY_KI_COST = 10;
/** ORIGEM: src/lib/game/engine.ts — batalhas: replay base 1,1 s + 0,48 s/rodada (teto 32 s). */
const BATTLE_REPLAY = { baseMs: 1100, perRoundMs: 480, maxMs: 32_000 } as const;
/** ORIGEM: src/lib/game/rules.ts — STAT_CAP. */
const STAT_CAP = 999;
/** ORIGEM: src/lib/game/rules.ts — ZENKAI. */
const ZENKAI = { relevanceFactor: 0.6, sameOpponentCooldownHours: 12, zenkaiRequiresHpPct: 0.5 } as const;
/** ORIGEM: src/lib/worldboss.ts — exportado e validado pelo teste de contrato. */
const BOSS = {
  durationHours: 72,
  attackCooldownSec: 10,
  attackEnergyCost: 10,
  attackMinHpPct: 0.3,
  minParticipationDamage: 500,
  hpCostPct: 0.15,
} as const;
/** ORIGEM: src/app/api/game/guilds/route.ts — MAX_MEMBERS. */
const GUILD_MAX_MEMBERS = 60;
/** ORIGEM: src/lib/seasons.ts. */
const SEASON_DAYS = 30;
const SEASON_POINTS_PER_WIN = 10;

// ---------------------------------------------------------------------
// Tipos da wiki
// ---------------------------------------------------------------------

export interface WikiTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export type WikiBlock =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'table'; table: WikiTable }
  | { kind: 'callout'; tone: 'info' | 'warn' | 'tip'; title?: string; text: string }
  /** Bloco expandível "Detalhes para curiosos" — fica no DOM (indexado pela busca). */
  | { kind: 'details'; summary: string; blocks: WikiBlock[] };

export interface WikiSection {
  id: string;
  title: string;
  icon: string;
  /** Resumo curto — aparece no índice (tooltip) e entra na busca. */
  summary: string;
  group: string;
  /** "Em resumo" — 2-3 bullets simples no topo da seção (leitura rápida). */
  resumo: string[];
  blocks: WikiBlock[];
}

// ---------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------

const br = (n: number): string => n.toLocaleString('pt-BR');

const minutes = (ms: number): string => Math.round(ms / 60_000) + ' min';

/** HP máximo de um vilão PvE (fórmula do engine — buildNpcCombatant). */
const enemyMaxHp = (e: (typeof ENEMIES)[number]): number => 80 + e.level * 15 + e.defense * 5;

const STAT_LABELS: Record<string, string> = { strength: 'Força', defense: 'Defesa', speed: 'Velocidade', ki: 'Ki' };
const STAT_SHORT: Record<string, string> = { strength: 'For', defense: 'Def', speed: 'Vel', ki: 'Ki' };
const MULT_LABELS: Record<string, string> = { physical: 'físico', ki: 'Ki', defense: 'defesa', speed: 'velocidade' };

// =====================================================================
// SEÇÕES DA WIKI
// =====================================================================

export const WIKI_SECTIONS: WikiSection[] = [
  // ================================================================
  // PRIMEIROS PASSOS
  // ================================================================
  {
    id: 'primeiros-passos',
    title: 'Primeiros Passos',
    icon: '🚀',
    group: 'Começar',
    summary: 'Ordem recomendada de ações para um personagem novo.',
    resumo: [
      '**Trabalhe, treine, lute** — nessa ordem, todo dia.',
      '**Trabalho não gasta energia** — só tempo (1 hora real).',
      'Energia é o recurso mais escasso: gaste-a em **treino e batalhas**.',
    ],
    blocks: [
      {
        kind: 'text',
        text: 'Seu guerreiro nasce **nível 1**, com 500 Zeni no bolso, atributos 10/10/10/10, 145 de vida e energia cheia. A energia volta devagar — dê uma olhada em [[recursos|Recursos]] para entender o ritmo. A rotina que funciona é a clássica: **trabalhar → treinar → lutar**.',
      },
      {
        kind: 'list',
        ordered: true,
        items: [
          '**Crie o personagem** ([[racas|Raças]]) — a raça define seus bônus permanentes. É para sempre!',
          '**Comece um turno de trabalho** ([[profissoes|Profissões]]) — dura 1 hora real, **não gasta energia** e rende Zeni + XP mesmo com o jogo fechado. Durante o turno só treino, lutas contra inimigos e torneio esperam — PvP, chefe mundial, loja, guilda, hospital e coletas seguem liberados.',
          '**Aprenda sua primeira técnica** ([[tecnicas|Técnicas]]) — o Rogafufuken (600 Zeni) já deixa seus golpes físicos 25% mais fortes.',
          '**Treine o atributo da sua build** ([[atributos|Atributos]]) — Força para golpes físicos, Ki para ondas de energia.',
          '**Lute contra os vilões** ([[pve|Campanhas PvE]]) — comece pelo Saibaman Verde e suba a fila conforme seu [[escala-poder|Poder de Luta]] cresce.',
          '**Compre equipamento** ([[loja|Loja]]) — Luvas de Treino (300 Zeni) e Gi de Batalha (250 Zeni) custam pouco e já fazem diferença.',
          'A partir daí: [[torneio|Torneio]], [[world-boss|chefe mundial]], [[esferas-dragao|Esferas do Dragão]] e [[guildas|Guilda]].',
        ],
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Dica de energia',
        text: 'Cada ponto de energia volta em **~5 minutos**. Treinar e lutar é o melhor uso dela — o trabalho rola por conta própria, sem gastar nada. Deixe um turno correndo enquanto ataca o chefe mundial ou planeja os próximos passos.',
      },
    ],
  },

  // ================================================================
  // CONTAS E PERSONAGENS
  // ================================================================
  {
    id: 'contas',
    title: 'Contas e Personagens',
    icon: '👤',
    group: 'Começar',
    summary: 'Conta na nuvem, convidado, limite de personagens e o que sobrevive a atualizações.',
    resumo: [
      'Pode jogar **sem cadastro** e salvar o guerreiro depois — nada se perde.',
      'Cada conta guarda até **3 personagens**.',
      'Contas **nunca** são deletadas por atualizações.',
    ],
    blocks: [
      {
        kind: 'list',
        items: [
          `Cada conta tem até **${MAX_CHARACTERS_PER_ACCOUNT} personagens** — troque a qualquer momento pelo menu do jogador.`,
          '**Convidado:** jogue sem cadastro e use "Salvar meu guerreiro" depois — o progresso vira conta na nuvem sem perda.',
          '**Conta na nuvem (e-mail + senha):** o progresso sobrevive a qualquer atualização do jogo.',
          '**Política de balanceamento:** quando as FÓRMULAS mudam de versão, personagens voltam ao estado inicial — preservando conta, nome, raça, avatar, guilda, cristais e cosméticos. Contas nunca são deletadas.',
        ],
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Estado do jogo preservado',
        text: 'A wiki abre sempre em nova aba justamente para não interromper timers de trabalho, regeneração de energia ou uma luta em andamento — volte para a aba do jogo e tudo continua lá.',
      },
    ],
  },

  // ================================================================
  // COMBATE
  // ================================================================
  {
    id: 'combate',
    title: 'Combate Turno a Turno',
    icon: '⚔️',
    group: 'Combate',
    summary: 'Rodadas, tipos de golpe, dano, esquiva, iniciativa e Ki de batalha.',
    resumo: [
      'Cada rodada os dois lados atacam uma vez — **quem tem mais Velocidade começa** (empate = moeda).',
      '**Golpes físicos** escalam de Força; **ondas de Ki** escalam de Ki e gastam a barra de batalha.',
      '**Técnicas** são os golpes especiais do [[tecnicas|loadout]]: mais poder por mais Ki.',
    ],
    blocks: [
      {
        kind: 'text',
        text: 'As lutas são simuladas **no servidor** e reproduzidas rodada a rodada no seu log. Na sua vez, o lutador escolhe sozinho entre golpe físico, onda de Ki ou técnica — seguindo sua [[estrategias|estratégia]] e o [[impeto|Ímpeto]] acumulado.',
      },
      {
        kind: 'text',
        text: 'Um exemplo com números reais: um guerreiro com **Força 20** e Luvas de Treino desfere golpes físicos de poder ~**50**. Contra o Saibaman Verde (defesa baixa), isso vira uns **35 a 45 de dano** por golpe. Se ele trocar para ondas de Ki com **Ki 18** e Bandana equipada, cada onda custa **10 de Ki de batalha** e bate parecido — a diferença é que tanques de defesa alta sofrem mais com energia.',
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Esquiva e defesa',
        text: 'Velocidade a favor do defensor aumenta a chance de desviar (entre **3% e 30%**, teto final de 40% somados os bônus). E nenhum tanque é imune: a defesa nunca anula mais que **80% de um golpe** — sempre passa um pedacinho.',
      },
      {
        kind: 'callout',
        tone: 'warn',
        title: 'A vida entra como você está',
        text: 'Em PvE e [[torneio|Torneio]], seu lutador entra com a vida **ATUAL** (no Torneio ela carrega entre as lutas da campanha). Em [[pvp|PvP]], o desafiante entra como está e o desafiado entra **sempre cheio** — cure-se antes de provocar alguém.',
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — fórmulas e parâmetros exatos',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: 'Tipos de golpe e custos de Ki de batalha (ORIGEM: engine.ts)',
              headers: ['Golpe', 'Escala com', 'Custo de Ki', 'Observações'],
              rows: [
                ['Golpe físico ("golpe brutal")', 'Força (+ arma)', '—', 'Aparece no log como "acerta um golpe brutal"'],
                ['Onda de Ki básica', 'Ki (+ acessório)', `${BASIC_ENERGY_KI_COST} de Ki`, 'Aparece como "onda de Ki devastadora"'],
                ['Técnica ([[tecnicas|Técnicas]])', 'Força ou Ki', '10–55 conforme a técnica', 'Multiplica o poder BRUTO do golpe; o Ki é gasto no lançamento, mesmo se o alvo esquivar'],
              ],
            },
          },
          {
            kind: 'text',
            text: `O **Ki de batalha** (barra separada da energia) começa cheio em \`40 + 4 × (Ki + acessório)\` e regenera **${Math.round(COMBAT.kiRegenPerRound * 100)}% do máximo por rodada**.`,
          },
          {
            kind: 'table',
            table: {
              caption: 'Fórmula de dano e parâmetros centrais (ORIGEM: engine.ts — COMBAT)',
              headers: ['Parâmetro', 'Valor', 'Efeito'],
              rows: [
                ['Poder bruto', '`2,2 × Força` ou `2,4 × Ki`', 'Com bônus de raça, [[transformacoes|transformação]] e equipamento já embutidos'],
                ['Variação do golpe', '±15%', 'Cada golpe roda entre 85% e 115% do poder'],
                ['Mitigação máxima (soft cap)', '80%', 'A defesa nunca anula um golpe inteiro'],
                ['Coeficiente de defesa física', String(COMBAT.physDefCoef).replace('.', ','), 'Peso da defesa contra golpes físicos'],
                ['Coeficiente de defesa de energia', String(COMBAT.energyDefCoef).replace('.', ','), 'Peso da resistência (Defesa + Ki) contra ondas'],
                ['Regeneração de Ki por rodada', `${Math.round(COMBAT.kiRegenPerRound * 100)}% do máximo`, 'Recarga contínua da barra de batalha'],
              ],
            },
          },
          {
            kind: 'text',
            text: '**Esquiva:** base `5% + 0,5% por ponto de velocidade a favor do defensor` (entre 3% e 30%), somada a bônus de raça e [[estrategias|estratégia]] e ajustada pela precisão da técnica — piso final de 2%, teto de 40%. Técnicas com precisão negativa (ex.: Kienzan **−5%**) são mais fáceis de desviar; com valor positivo (Dodonpa **+5%**) acertam mais.',
          },
          {
            kind: 'text',
            text: '**Perfuração:** técnicas com `defensePierce` (ex.: Kienzan 35%) reduzem a defesa efetiva do alvo antes do soft cap — o caminho contra tanques. Multiplicadores de [[estrategias|estratégia]] e [[escala-poder|Escala de Poder]] entram por último, no líquido.',
          },
        ],
      },
    ],
  },

  // ================================================================
  // ÍMPETO
  // ================================================================
  {
    id: 'impeto',
    title: 'Ímpeto',
    icon: '🔥',
    group: 'Combate',
    summary: 'A adrenalina do combate: como acumula, como se gasta, Quebra de Limite e Exaustão.',
    resumo: [
      'Você acumula **Ímpeto ao apanhar** — golpe forte, crítico sofrido, metade da vida.',
      'Gasta para **encadear combos** (1), **defender** (2) e **romper limites** (3 + Ki).',
      'Romper limites é poderoso — mas cobra **exaustão** quando acaba.',
    ],
    blocks: [
      {
        kind: 'text',
        text: `Ímpeto é adrenalina acumulada em combate. Todo lutador começa com **${IMPETO.start}** e carrega no máximo **${IMPETO.max}**. Ele alimenta as viradas — e os [[talentos|Talentos]] compráveis na loja o usam ainda mais.`,
      },
      {
        kind: 'text',
        text: `Na prática: você leva um golpe que doeu (quase um quinto da sua vida de uma vez)? **+1 Ímpeto** na hora. Um crítico abre brecha na diferença de [[escala-poder|escala]]? **+1**. Sua vida passa da metade para baixo? **+1** — uma vez por luta. E encarar alguém mais forte no início da luta já dá **+1** de motivação de azarão.`,
      },
      {
        kind: 'table',
        table: {
          caption: 'Como gastar (ORIGEM: impeto.ts — IMPETO)',
          headers: ['Ação', 'Custo', 'Efeito'],
          rows: [
            [
              'Estender Combo',
              `${IMPETO.comboCost} Ímpeto`,
              `Outro golpe na sequência, cada um mais fraco que o anterior — até ${IMPETO.comboMaxAttacks} ataques no combo`,
            ],
            ['Defesa Heroica', `${IMPETO.heroicDefenseCost} Ímpetos`, 'Um golpe poderoso recebido cai pela METADE'],
            [
              'Quebra de Limite',
              `${IMPETO.quebraCost} Ímpetos + ${IMPETO.quebraKiCost} de Ki`,
              `+1 Escala de Poder por ${IMPETO.quebraRounds} rodadas — dispara quando a vida cai abaixo de ${Math.round(IMPETO.quebraHpThreshold * 100)}%, uma vez por combate`,
            ],
          ],
        },
      },
      {
        kind: 'callout',
        tone: 'warn',
        title: 'Exaustão pós-limite',
        text: `Quando a Quebra de Limite acaba, vêm ${IMPETO.exaustaoRounds} rodadas de fadiga: seus golpes enfraquecem e você apanha mais. O talento [[talentos|Segundo Vento]] cancela a fadiga gastando ${IMPETO.segundoVentoCost} Ímpetos.`,
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — gatilhos exatos e política por estratégia',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: 'Gatilhos de ganho (ORIGEM: impeto.ts — IMPETO)',
              headers: ['Gatilho', 'Ganho', 'Limite'],
              rows: [
                [`Receber um golpe poderoso (dano ≥ ${Math.round(IMPETO.heavyBlowPct * 100)}% do seu HP máximo)`, '+1', 'Uma vez por rodada'],
                ['Obter um crítico de Abertura (azarão contra [[escala-poder|escalas]] acima)', '+1', 'Uma vez por rodada'],
                ['Cair abaixo da metade da vida', '+1', 'Uma vez POR COMBATE'],
                ['Espírito de Superação: adversário ≥ 1 escala acima no início', '+1', 'No início do combate'],
              ],
            },
          },
          {
            kind: 'text',
            text: `**Combo em decaimento:** cada golpe extra do combo perde força (×${String(IMPETO.comboDamageDecay).replace('.', ',')} por golpe extra) e golpes extras **não geram Ímpeto** para quem ataca — o defensor continua podendo ganhar normalmente.`,
          },
          {
            kind: 'text',
            text: `**Exaustão exata:** ${IMPETO.exaustaoRounds} rodadas causando ×${String(IMPETO.exaustaoDamageDealtMult).replace('.', ',')} de dano e recebendo ×${String(IMPETO.exaustaoDamageTakenMult).replace('.', ',')}.`,
          },
          {
            kind: 'table',
            table: {
              caption: 'Política de gasto por [[estrategias|estratégia]] (ORIGEM: impeto.ts — IMPETO_COMBO_THRESHOLD)',
              headers: ['Estilo', 'Encadeia combo com'],
              rows: Object.entries(IMPETO_COMBO_THRESHOLD).map(([id, n]) => {
                const nome = STRATEGY_LIST.find((s) => s.id === id)?.name ?? id;
                return [nome, `${n} Ímpeto${n > 1 ? 's' : ''} em caixa`];
              }),
            },
          },
        ],
      },
    ],
  },

  // ================================================================
  // ESCALA DE PODER / SCOUTER
  // ================================================================
  {
    id: 'escala-poder',
    title: 'Escala de Poder e Scouter',
    icon: '🔍',
    group: 'Combate',
    summary: 'As 10 escalas de ASCENSÃO Z, o poder do scouter, Armadura de Escala e Aberturas.',
    resumo: [
      'O scouter soma tudo que você tem num **Poder de Luta** — a linguagem de potência do jogo.',
      'São **10 Escalas**, de Mortal Comum a Transcendente.',
      'Escala acima do rival = **mais dano**; abaixo = **Armadura de Escala** segurando você.',
    ],
    blocks: [
      {
        kind: 'text',
        text: 'Em vez de contar bilhões, o jogo mede potência em **degraus**. Um guerreiro recém-criado começa como **Mortal Comum** 🧍; quem treina firme cruza o patamar **Marcial** 🥋 (poder 120) e segue subindo até o **Transcendente** 👑. As cartas de oponente mostram a escala deles ao lado do seu — aquele selinho vermelho "+2 escalas acima" quer dizer **cuidado**.',
      },
      {
        kind: 'text',
        text: `A vantagem é real: cada escala acima do oponente dá **+${Math.round(SCALE_COMBAT.advantagePerLevel * 100)}% de dano** (limitado a ${SCALE_COMBAT.maxDiff} degraus de diferença). E quem está abaixo bate na **Armadura de Escala**: −${Math.round(SCALE_COMBAT.armorPerLevel * 100)}% por degrau de diferença. Escala **não** mexe em esquiva nem precisão — só Velocidade manda nisso.`,
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'O azarão tem esperança',
        text: `Com ${SCALE_COMBAT.crushingThreshold}+ escalas de diferença, os golpes básicos do azarão são esmagados… mas **críticos geram ABERTURAS**: acumule ${SCALE_COMBAT.aberturasNeeded} e a próxima **técnica** trata a diferença como se fosse só ${SCALE_COMBAT.maxDiff} — a "quebra de barreira". Quem encara gigantes ainda ganha +1 de [[impeto|Ímpeto]] no início.`,
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — tabela completa das 10 escalas',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: `Escalas de Poder (ORIGEM: powerScale.ts — POWER_SCALES, ${POWER_SCALES.length} patamares)`,
              headers: ['Escala', 'Nome', 'Poder mínimo'],
              rows: POWER_SCALES.map((s) => [`${s.index}`, `${s.emoji} ${s.nome}`, br(s.threshold)]),
            },
          },
          {
            kind: 'text',
            text: `**Poder de Luta do scouter:** \`15 × nível + ataque + 0,9 × poder de Ki + defesa + 0,6 × resistência + 2 × velocidade\` (com equipamentos e bônus raciais contando). **Crítico de Abertura:** chance de 6% + 0,3% por ponto de velocidade a favor (entre 3% e 9%); dano ampliado ×${String(SCALE_COMBAT.aberturaCritMult).replace('.', ',')}. Golpe esmagado: ×${String(SCALE_COMBAT.crushingMult).replace('.', ',')}.`,
          },
        ],
      },
    ],
  },

  // ================================================================
  // FIM DE LUTA: KO vs DECISÃO
  // ================================================================
  {
    id: 'fim-de-luta',
    title: 'Fim de Luta: KO × Decisão',
    icon: '⚖️',
    group: 'Combate',
    summary: 'Limite de rodadas, critérios dos jurados, hospital e level-up.',
    resumo: [
      'Luta acaba por **nocaute** (HP zerado) — o caminho normal.',
      'Sem KO em 40 rodadas? **Decisão dos jurados**: mais vida % ganha.',
      '**Hospital só no nocaute** — derrota por decisão te deixa sair com a vida que tem.',
    ],
    blocks: [
      {
        kind: 'text',
        text: 'A luta comum termina por **NOCAUTE**: o primeiro a chegar a zero de vida perde (se os dois caem juntos, vence quem desferiu o golpe final). A maioria das lutas resolve em 11–15 rodadas. Se dois tanques se travarem, o limite é de **40 rodadas** — e aí os **jurados** decidem.',
      },
      {
        kind: 'text',
        text: 'O veredito aparece narrado no log ("⚖️ FIM DO TEMPO"), então você vê exatamente **por que** venceu ou perdeu. Os critérios, em ordem:',
      },
      {
        kind: 'table',
        table: {
          caption: 'Critérios da Decisão (publicados no log da luta — ORIGEM: engine.ts)',
          headers: ['Critério', 'Regra'],
          rows: [
            ['1º', 'Maior HP **percentual** (ex.: 71% × 64% vence, mesmo com menos vida absoluta)'],
            ['2º', 'Empate percentual → maior HP **absoluto**'],
            ['3º', 'Empate total → moeda do árbitro (50/50)'],
          ],
        },
      },
      {
        kind: 'table',
        table: {
          caption: 'O que acontece com a vida depois da luta',
          headers: ['Situação', 'Vida final'],
          rows: [
            ['Vitória', 'A vida final do log (Majin ainda **absorve +4% do máximo** ao vencer)'],
            ['Derrota por NOCAUTE', `Você acorda no **hospital com 1 de vida** — a primeira cura do dia é grátis; as demais custam ${HEAL_COST_PER_HP} Zeni por HP`],
            ['Derrota por Decisão', 'Você sai do ringue com a vida final do log — decisão **NÃO** vai para o hospital'],
            ['Subiu de nível na luta', 'Vida restaurada à CHEIA após o resultado (vitória ou derrota)'],
          ],
        },
      },
    ],
  },

  // ================================================================
  // ESTRATÉGIAS
  // ================================================================
  {
    id: 'estrategias',
    title: 'Estratégias de Combate',
    icon: '🎭',
    group: 'Combate',
    summary: 'Os 5 estilos de luta: multiplicadores reais de dano e política de Ímpeto.',
    resumo: [
      'Cinco estilos que guiam as decisões automáticas do seu lutador.',
      'Trocar é **grátis**, a qualquer momento, na ficha do personagem.',
      'O estilo muda dano causado/recebido — e como seu [[impeto|Ímpeto]] é gasto.',
    ],
    blocks: [
      {
        kind: 'table',
        table: {
          caption: 'Estratégias (ORIGEM: content/techniques.ts — STRATEGIES)',
          headers: ['Estilo', 'Dano causado', 'Dano recebido', 'Ímpeto p/ combo'],
          rows: STRATEGY_LIST.map((s) => [
            `${s.icon} ${s.name}`,
            `${Math.round(s.damageDealtMult * 100)}%`,
            `${Math.round(s.damageTakenMult * 100)}%`,
            String(IMPETO_COMBO_THRESHOLD[s.id] ?? 2),
          ]),
        },
      },
      {
        kind: 'list',
        items: [
          '**Agressivo** vive no vermelho: bate mais, apanha mais, arrisca mais técnicas.',
          '**Defensivo** troca um pouco de dano por 12% a menos recebido e +3% de esquiva.',
          '**Corpo a Corpo** soma +10% nos golpes físicos e evita gastar Ki à toa.',
          '**Especialista em Ki** canaliza ondas (+20%) mas o corpobate mais fraco (−15%).',
        ],
      },
    ],
  },

  // ================================================================
  // TÉCNICAS
  // ================================================================
  {
    id: 'tecnicas',
    title: 'Técnicas',
    icon: '🌀',
    group: 'Combate',
    summary: 'As 11 técnicas, mestres que ensinam, loadout de 4 slots e custos reais.',
    resumo: [
      'Técnicas são **golpes especiais** aprendidos com mestres (Zeni + nível).',
      'Cada uma **multiplica o poder** do golpe e gasta Ki de batalha por uso.',
      'Loadout: **3 slots comuns + 1 Supremo** — só o equipado luta.',
    ],
    blocks: [
      {
        kind: 'text',
        text: 'A primeira compra de qualquer guerreiro costuma ser o **Rogafufuken** (600 Zeni, nível 1): golpes físicos **25% mais fortes**. Lá no fim da jornada, a suprema **Genki Dama** multiplica por **1,75×** e perfura 30% da defesa — o golpe que apaga horizontes.',
      },
      {
        kind: 'text',
        text: 'Aprender nunca enfraquece você: a técnica entra no **primeiro slot livre** do loadout sozinha (comuns nos slots 1–3, supremas no slot S). Técnicas equipadas entram nas decisões automáticas de combate conforme sua [[estrategias|estratégia]].',
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Garantia de espetáculo (v0.9.24)',
        text: 'Lutador com técnica equipada e Ki suficiente usa **pelo menos 1 técnica por batalha**: a partir da 3ª rodada sem nenhum golpe especial, a próxima oportunidade vira certeza (o peso da estratégia continua valendo para os demais usos). Nenhuma batalha passa em branco — e a missão diária "use 5 técnicas" progride de forma previsível.',
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'O caminho contra tanques',
        text: 'A perfuração ignora parte da defesa: **Kienzan** corta 35%, **Makankosappo** e **Genki Dama** ignoram 30%. Contras e precisões estão na tabela de detalhes.',
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — tabela completa das 11 técnicas e mestres',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: 'Técnicas (ORIGEM: content/techniques.ts — TECHNIQUES)',
              headers: ['Técnica', 'Tipo', 'Poder', 'Ki', 'Precisão', 'Nível', 'Preço'],
              rows: TECHNIQUES.map((t) => [
                `${t.icon} ${t.name}`,
                t.type === 'energy' ? 'Energia' : 'Física',
                `${String(t.power).replace('.', ',')}×`,
                String(t.kiCost),
                t.accuracy === 0 ? '—' : t.accuracy > 0 ? `+${Math.round(t.accuracy * 100)}%` : `${Math.round(t.accuracy * 100)}%`,
                String(t.minLevel),
                `${br(t.price)} Zeni`,
              ]),
            },
          },
          {
            kind: 'table',
            table: {
              caption: 'Mestres (ORIGEM: content/techniques.ts — TRAINING_MASTERS)',
              headers: ['Mestre', 'Escola', 'Local', 'Ensina'],
              rows: TRAINING_MASTERS.map((m) => [`${m.emoji} ${m.name}`, m.title, m.location, m.techniques.length + ' técnica(s)']),
            },
          },
        ],
      },
    ],
  },

  // ================================================================
  // TALENTOS
  // ================================================================
  {
    id: 'talentos',
    title: 'Talentos de Ímpeto',
    icon: '🎖️',
    group: 'Combate',
    summary: 'Os 3 privilégios compráveis que ampliam o uso de Ímpeto em combate.',
    resumo: [
      'Três **privilégios permanentes** comprados na [[loja|loja]] com Zeni.',
      'Eles disparam **sozinhos** em combate, quando o gatilho acontece.',
      'Repetir acerto, esquiva extra e cancelar a exaustão.',
    ],
    blocks: [
      {
        kind: 'table',
        table: {
          caption: 'Talentos (ORIGEM: content/talents.ts — TALENTS)',
          headers: ['Talento', 'Efeito', 'Custo por disparo', 'Nível', 'Preço'],
          rows: TALENTS.map((t) => [
            `${t.icon} ${t.name}`,
            t.effect,
            `${t.impetoCost} Ímpeto${t.impetoCost > 1 ? 's' : ''}`,
            String(t.minLevel),
            `${br(t.price)} Zeni`,
          ]),
        },
      },
      {
        kind: 'list',
        items: [
          '**Repetição do Destino** — golpe esquivado? Pague 1 Ímpeto e repita o teste de acerto (1×/rodada).',
          '**Reposicionamento Dramático** — golpe poderoso vindo? Pague 1 Ímpeto por uma esquiva extra com +15% de chance (teto 55%). Anular um golpe de alguém 2+ [[escala-poder|escalas]] acima conta para a conquista *David vs Golias*.',
          '**Segundo Vento** — a [[impeto|Exaustão]] ia cobrar? 2 Ímpetos cancelam a fadiga na hora.',
        ],
      },
    ],
  },

  // ================================================================
  // ATRIBUTOS
  // ================================================================
  {
    id: 'atributos',
    title: 'Atributos',
    icon: '💪',
    group: 'Progressão',
    summary: 'Força, Ki, Defesa e Velocidade: efeitos, treino instantâneo, custos e o teto de 999.',
    resumo: [
      '**Força** = golpes físicos · **Ki** = ondas de energia (sem aumentar a energia de ações).',
      '**Defesa** = vida máxima e resistência · **Velocidade** = iniciativa e esquiva.',
      'Treino custa **3 ⚡ + Zeni** e é **instantâneo** (teto 999 por atributo).',
    ],
    blocks: [
      {
        kind: 'list',
        items: [
          '💪 **Força** — cada ponto deixa seus golpes físicos ~2 pontos mais fortes.',
          '✨ **Ki** — cada ponto soma ~2 de poder nas ondas **sem aumentar a energia máxima**.',
          '🛡️ **Defesa** — cada ponto dá **+5 de vida máxima** e segura melhor os golpes.',
          '💨 **Velocidade** — decide quem começa a luta e esquiva mais.',
        ],
      },
      {
        kind: 'text',
        text: `**Treinar é instantâneo:** clique no "+", o ponto entra na hora. Cada sessão custa **${TRAIN_ENERGY_COST} de energia** e Zeni que cresce conforme o atributo sobe (Humano paga 10% menos). O ganho é +1 ponto — mais os bônus dos [[loja|equipamentos de treino]] que você possui.`,
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Zenkai (Saiyajin)',
        text: `Ao PERDER para um adversário relevante, Saiyajins ganham **+1 de Força permanente**. As regras anti-farm: o oponente precisa ter nível ≥ ${Math.round(ZENKAI.relevanceFactor * 100)}% do seu, não repete contra o mesmo oponente em ${ZENKAI.sameOpponentCooldownHours} h e é preciso ENTRAR na luta com ≥ ${Math.round(ZENKAI.zenkaiRequiresHpPct * 100)}% de vida — perder de propósito não ativa nada.`,
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — fórmulas derivadas e curva de custo de treino',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: 'Valores derivados (ORIGEM: engine.ts — computeDerived)',
              headers: ['Stat', 'Fórmula'],
              rows: [
                ['Vida máxima', '`80 + 15 × nível + 5 × Defesa`'],
                ['Energia máxima', '`100 (fixa)`'],
                ['Poder de Luta (scouter)', '`15 × nível + ataque + 0,9×poder de Ki + defesa + 0,6×resistência + 2 × velocidade`'],
                ['Poder físico', '`2,2 × Força` (+ arma)'],
                ['Poder de Ki', '`2,4 × Ki` (+ acessório)'],
              ],
            },
          },
          {
            kind: 'table',
            table: {
              caption: `Curva de custo de treino (ORIGEM: content/world.ts — baseTrainingCost; ×1,05 por ponto até 150, ×1,035 depois; teto de qualquer atributo: ${STAT_CAP})`,
              headers: ['Atributo em', 'Custo por ponto (Zeni)'],
              rows: [10, 25, 50, 100, 150, 200, 300].map((v) => [String(v), br(baseTrainingCost(v))]),
            },
          },
        ],
      },
    ],
  },

  // ================================================================
  // RECURSOS
  // ================================================================
  {
    id: 'recursos',
    title: 'Recursos e Economia',
    icon: '💰',
    group: 'Progressão',
    summary: 'Zeni, cristais, energia, XP e níveis: regeneração, curvas e conversões.',
    resumo: [
      '**Zeni** compra quase tudo; **💎 cristais** vêm de quests, conquistas e chefe mundial.',
      'Energia volta **1 ponto a cada 5 min** (Humano: mais rápido).',
      'Vida volta **1 ponto a cada 12 s** (Namekuseijin: mais rápido).',
    ],
    blocks: [
      {
        kind: 'table',
        table: {
          caption: 'Moedas (ORIGEM: content/world.ts e economy.ts)',
          headers: ['Moeda', 'Como se ganha', 'O que compra'],
          rows: [
            [
              '🪙 Zeni',
              'Profissões, vitórias PvE/PvP, [[torneio|torneio]], [[world-boss|chefe mundial]], quests, conquistas, [[esferas-dragao|desejo de riqueza]]',
              'Equipamentos, técnicas, [[transformacoes|transformações]], [[talentos|talentos]], guilda, cura, treino',
            ],
            [
              '💎 Cristais',
              'Quests diárias/semanais, [[conquistas|conquistas]], [[world-boss|chefe mundial]]',
              'Consumíveis, equipamentos de treino e [[loja|cosméticos]]',
            ],
          ],
        },
      },
      {
        kind: 'text',
        text: `A regeneração é o relógio do jogo: cada ponto de energia demora **5 minutos** para voltar — por isso vale ouro. A vida volta bem mais rápido (**12 segundos por ponto**), então descansar fora do hospital é viável entre lutas.`,
      },
      {
        kind: 'list',
        items: [
          `**Cura no hospital:** ${HEAL_COST_PER_HP} Zeni por HP — mas a **primeira cura de cada dia é GRÁTIS** (restaura tudo; renova à meia-noite, horário de Brasília). Depois dela, ou um Feijão Senzu (10 💎) restaura 100% na hora.`,
          `**Venda de itens:** ${Math.round(SELL_PRICE_RATIO * 100)}% do preço de compra, na mesma moeda (Zeni→Zeni, 💎→💎).`,
          'Subir de nível restaura a vida à cheia — mas nunca a energia.',
        ],
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — curva de XP, modificadores raciais e tetos',
        blocks: [
          {
            kind: 'text',
            text:
              '**Curva de XP:** `80 × nível^1,55` — passar do nível 1 para o 2 custa ' +
              br(xpToNextLevel(1)) +
              ' XP; do 10, ' +
              br(xpToNextLevel(10)) +
              '; do 20, ' +
              br(xpToNextLevel(20)) +
              '; do 30, ' +
              br(xpToNextLevel(30)) +
              '. O level-up restaura a vida após o resultado da luta em andamento.',
          },
          {
            kind: 'table',
            table: {
              caption: 'Regeneração com modificadores raciais (ORIGEM: content/world.ts — REGEN)',
              headers: ['Recurso', 'Taxa base', 'Modificadores raciais'],
              rows: [
                ['⚡ Energia', `1 ponto / ${REGEN.energySeconds / 60} min`, 'Humano +10% mais rápido (≈ 4min33s)'],
                ['❤️ Vida', `1 HP / ${REGEN.hpSeconds} s`, 'Namekuseijin +15% mais rápido (≈ 10s)'],
              ],
            },
          },
          {
            kind: 'text',
            text: 'Teto de Zeni: 2 bilhões (guarda de valor Int32). Energia nunca é recuperada ao subir de nível — só por tempo, Cápsula de Energia (loja) ou desejo de Vitalidade.',
          },
        ],
      },
    ],
  },

  // ================================================================
  // AÇÕES E CUSTOS
  // ================================================================
  {
    id: 'accoes-custos',
    title: 'Ações, Custos e Ocupação',
    icon: '⏱️',
    group: 'Progressão',
    summary: 'Quanto custa cada ação em energia/tempo e a matriz completa de ocupação (o que fica bloqueado durante o trabalho).',
    resumo: [
      '**Trabalhar não gasta energia** — só 1 hora de tempo real.',
      '**Treinar e lutar** custam 3 ⚡ cada; **chefe mundial** custa 10 ⚡.',
      'No trabalho SÓ PvE/torneio travam — **tudo mais liberado, coleta inclusive**.',
    ],
    blocks: [
      {
        kind: 'table',
        table: {
          caption: 'Custos por ação (ORIGEM: content/world.ts — custos cobrados pelos handlers reais)',
          headers: ['Ação', 'Energia', 'Duração'],
          rows: [
            ['Treino de atributo', `${TRAIN_ENERGY_COST} ⚡`, 'Instantâneo'],
            ['Batalha PvE / PvP / [[torneio|torneio]]', `${BATTLE_ENERGY_COST} ⚡`, 'Replay animado de ~2 a 20 s (conforme as rodadas)'],
            ['Turno de [[profissoes|profissão]]', '**0 ⚡** (não gasta energia)', '60 min reais'],
            ['Ataque ao [[world-boss|chefe mundial]]', `${BOSS.attackEnergyCost} ⚡`, `Cooldown de ${BOSS.attackCooldownSec} s entre ataques`],
          ],
        },
      },
      {
        kind: 'text',
        text: `As batalhas têm **duração real controlada pelo servidor**: a recompensa só cai na conta depois do replay terminar, recarregar a página retoma o trecho que falta e nada é cobrado duas vezes. O replay leva ~1 s para começar e meio segundo por rodada — o teto é de ${(BATTLE_REPLAY.maxMs / 1000).toFixed(0)} s nas lutas mais longas.`,
      },
      {
        kind: 'callout',
        tone: 'warn',
        title: 'Matriz de ocupação (v0.16 — definitiva)',
        text: '**TRABALHANDO bloqueia APENAS 2 ações:** combate PvE contra inimigos e torneio. **TUDO mais fica liberado durante o turno:** treino, PvP, chefe mundial, loja (comprar/vender/usar), gestão completa de guilda (doar, fundar, entrar, sair), coleta de recompensas (conquistas, diárias, missões, torneio), hospital, equipamento/inventário, perfil e Shenron. **Em luta em andamento:** não iniciar outra luta/treino/trabalho até o desfecho — mas coletas seguem liberadas.',
      },
      {
        kind: 'table',
        table: {
          caption: 'Matriz ação × estado (ORIGEM: rules.ts — MISSION_BLOCKED_ACTIONS/ACTIVITY_BLOCKED_ACTIONS; a suíte vigia)',
          headers: ['Ação', 'Trabalhando', 'Em luta (atividade)', 'Livre'],
          rows: [
            ['Treino de atributo', '✅', '❌ Bloqueado', '✅'],
            ['Batalha PvE (inimigos)', '❌ Bloqueado', '❌ Bloqueado', '✅'],
            ['Torneio', '❌ Bloqueado', '❌ Bloqueado', '✅'],
            ['PvP (atacar jogador)', '✅ Liberado', '❌ (uma luta por vez)', '✅'],
            ['Chefe mundial', '✅ Liberado', '✅ Liberado (ataque instantâneo)', '✅'],
            ['Loja (comprar/vender/usar/equipar)', '✅ Liberado', '✅ Liberado', '✅'],
            ['Guilda (fundar/entrar/sair/doar)', '✅ Liberado', '✅ Liberado', '✅'],
            ['Coletar recompensa (qualquer tipo)', '✅ Liberado', '✅ Liberado', '✅'],
            ['Hospital (curar)', '✅ Liberado', '✅ Liberado', '✅'],
            ['Shenron (desejos)', '✅ Liberado', '✅ Liberado', '✅'],
            ['Perfil / inventário / visualizações', '✅ Liberado', '✅ Liberado', '✅'],
          ],
        },
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Coleta nunca espera ocupação',
        text: 'Conquistas, missões diárias/semanais, recompensa do próprio trabalho e do torneio: **coletar é sempre possível** — mesmo no meio de um turno de trabalho, treino ou batalha. A coleta não entra no slot de atividade e não interfere em timers em andamento.',
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'PvP não tem "escudo" para a vítima',
        text: 'Quem ATACA não pode estar em luta em andamento e precisa de pelo menos 20% de vida — mas pode atacar **durante o próprio turno de trabalho**. Quem SOFRE o ataque é sempre atacável — esteja trabalhando ou lutando (ver [[pvp|PvP]]).',
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — vida mínima por ação e matemática do replay',
        blocks: [
          {
            kind: 'list',
            items: [
              'Lutas PvP, PvE e de torneio exigem entrar com **≥ 20% da vida** (mínimo 20 HP).',
              `Atacar o chefe mundial exige **≥ ${Math.round(BOSS.attackMinHpPct * 100)}% da vida** — e cada ataque consome ${Math.round(BOSS.hpCostPct * 100)}% da vida ATUAL (desgastante, nunca letal).`,
              `Replay de batalha: base de ${(BATTLE_REPLAY.baseMs / 1000).toFixed(1).replace('.', ',')} s + ${BATTLE_REPLAY.perRoundMs / 1000} s por rodada, teto de ${(BATTLE_REPLAY.maxMs / 1000).toFixed(0)} s (ORIGEM: rules.ts — ACTIVITY_DURATION, sincronizado com o animador do cliente).`,
            ],
          },
        ],
      },
    ],
  },

  // ================================================================
  // RAÇAS
  // ================================================================
  {
    id: 'racas',
    title: 'Raças (Classes)',
    icon: '🧬',
    group: 'Progressão',
    summary: 'As 5 raças com todos os bônus reais de combate e economia — a escolha de "classe" do jogo.',
    resumo: [
      'A raça é **permanente** — define o arquétipo do personagem.',
      'Cada uma brilha num papel: agressão, treino, regeneração, trabalho ou versatilidade.',
      'Todos os números abaixo são exatamente os aplicados pelo motor.',
    ],
    blocks: [
      {
        kind: 'table',
        table: {
          caption: 'Bônus raciais (ORIGEM: content/races.ts — RACES)',
          headers: ['Raça', 'Combate', 'Economia'],
          rows: [
            ['🟠 Saiyajin', '+8% dano físico; +10% XP de batalha; **Zenkai** (+1 Força ao perder para adversário relevante)', '—'],
            ['🟡 Humano', '+7% defesa; +2% dano de Ki', 'Energia regenera 10% mais rápido; treinos −10% de Zeni'],
            ['🟢 Namekuseijin', '+5% dano de Ki; +4,5% esquiva', 'Vida regenera 15% mais rápido'],
            ['⚙️ Androide', '+3,5% velocidade e +4,5% esquiva; +6% chance de atacar com Ki', '+5% de Zeni em trabalhos'],
            ['💗 Majin', '+2% em TUDO (físico, Ki, defesa, velocidade); absorve 4% do HP máximo ao vencer', '—'],
          ],
        },
      },
      {
        kind: 'callout',
        tone: 'tip',
        title: 'Qual escolher?',
        text: 'Saiyajin para agressão e progressão por risco; Humano para treino eficiente; Namekuseijin para resistir a longo prazo; Androide para trabalho constante e ondas de Ki; Majin para a build equilibrada sem pontos fracos.',
      },
    ],
  },

  // ================================================================
  // TRANSFORMAÇÕES
  // ================================================================
  {
    id: 'transformacoes',
    title: 'Transformações',
    icon: '⚡',
    group: 'Progressão',
    summary: 'Árvore por raça (3 ramos finais), requisitos, bônus permanentes e multiplicadores ativos.',
    resumo: [
      'Cada raça tem uma árvore: 2 formas iniciais + **3 ramos finais** (físico/equilibrado/Ki).',
      'Desbloquear dá **bônus permanente**; a forma ATIVA dá multiplicadores em luta.',
      'Trocar de forma é **grátis e instantâneo**, a qualquer momento.',
    ],
    blocks: [
      {
        kind: 'text',
        text: 'A árvore clássica: **Forma Base → Transformação I → Transformação II → três ramos finais** — você escolhe UM (A: físico, B: equilibrado, C: Ki). Desbloquear cada degrau exige nível (5 / 12 / 20), atributos e, em alguns casos, uma técnica específica ou um turno de profissão concluído (ex.: o Potencial Desbloqueado do Humano pede 1 trabalho de Acadêmico; o Caos Desencadeado do Majin, 1 de Atleta).',
      },
      {
        kind: 'text',
        text: `O Super Saiyajin, por exemplo, exige nível 12, Força 40 e Ki 30, a técnica Kamehameha e a forma anterior (Oozaru). Ao desbloquear, você ganha **+2 Força e +2 Ki permanentes** — e a forma ativa multiplica tudo: físico e Ki ×1,15, defesa ×1,08, velocidade ×1,05.`,
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — árvore Saiyajin completa',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: `Exemplo — árvore Saiyajin (ORIGEM: content/transformations.ts; as outras raças seguem a mesma estrutura — ${TRANSFORMATIONS.length} formas no total)`,
              headers: ['Forma', 'Nível', 'Requisitos', 'Bônus permanente', 'Multiplicadores ativos'],
              rows: TRANSFORMATIONS.filter((t) => t.race === 'saiyajin').map((t) => [
                `${t.icon} ${t.name}`,
                String(t.minLevel),
                [
                  Object.entries(t.requiredStats ?? {})
                    .map(([k, v]) => `${STAT_LABELS[k] ?? k} ${v}`)
                    .join(', ') || null,
                  t.requiredTechnique ? `técnica: ${t.requiredTechnique}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—',
                t.bonuses
                  ? Object.entries(t.bonuses)
                      .map(([k, v]) => `+${v} ${STAT_SHORT[k] ?? k}`)
                      .join(' ')
                  : '—',
                Object.entries(t.multipliers ?? {})
                  .map(([k, v]) => `${MULT_LABELS[k] ?? k} ×${String(v).replace('.', ',')}`)
                  .join(' · ') || '—',
              ]),
            },
          },
        ],
      },
    ],
  },

  // ================================================================
  // PROFISSÕES
  // ================================================================
  {
    id: 'profissoes',
    title: 'Profissões e Trabalho',
    icon: '🌾',
    group: 'Progressão',
    summary: '5 profissões, 5 ranks com promoções, recompensas por rank e chance de Esfera do Dragão.',
    resumo: [
      'Turnos de **1 hora real** rendem Zeni + XP — **sem custo de energia**.',
      'Ranks sobem com o trabalho: promoções pagam **bônus gordos**.',
      'Cada turno coletado pode revelar uma **Esfera do Dragão**.',
    ],
    blocks: [
      {
        kind: 'text',
        text: `O trabalho é a base econômica — e é de graça em energia: cada turno dura **60 minutos reais** e rende Zeni + XP na coleta. O progresso continua com o jogo fechado. Profissões: ${PROFESSIONS.map((p) => `${p.icon} ${p.name}`).join(', ')}.`,
      },
      {
        kind: 'table',
        table: {
          caption: 'Recompensas por rank (ORIGEM: content/world.ts — PROFESSION_RANKS)',
          headers: ['Rank', 'Zeni/turno', 'XP por turno', 'Chance de Esfera', 'Conclusões p/ subir'],
          rows: PROFESSION_RANKS.map((r, i) => [
            String(i + 1),
            br(r.zeni),
            `${Math.round(r.xpPct * 100)}% do nível atual`,
            `${Math.round(r.dragonBallChance * 100)}%`,
            r.completionsToPromote === 0 ? '— (topo)' : String(r.completionsToPromote),
          ]),
        },
      },
      {
        kind: 'list',
        items: [
          'O XP do turno é **fração do XP exigido pelo seu nível atual** (10% → 25%) — continua útil em qualquer progressão.',
          'Cancelar um turno em andamento não devolve nada — coletar exige o término real do timer.',
          '**Dica:** o Androide ganha +5% de Zeni em trabalhos (bônus racial que segue valendo).',
        ],
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — matemática das promoções',
        blocks: [
          {
            kind: 'text',
            text: 'Promoções acontecem automaticamente ao acumular conclusões (**3, 4, 5 e 6 por rank** — 18 h de dedicação até o topo) e pagam bônus únicos de **+1.000 / +3.000 / +9.000 / +30.000 Zeni**. O Zeni por turno sobe de 300 (rank 1) a 1.500 (rank 5) — 5× o inicial.',
          },
        ],
      },
    ],
  },

  // ================================================================
  // PvE
  // ================================================================
  {
    id: 'pve',
    title: 'Campanhas PvE (Vilões)',
    icon: '👹',
    group: 'Progressão',
    summary: 'Os 9 vilões da campanha com níveis, recompensas e a fila crescente.',
    resumo: [
      '**9 vilões clássicos** em dificuldade crescente — comece pelo Saibaman.',
      'O painel mostra stats e recompensas de cada um antes de você aceitar.',
      'Vencer paga Zeni + XP; perder rende uma fração do XP (e hospital só no nocaute).',
    ],
    blocks: [
      {
        kind: 'text',
        text: 'A campanha começa fácil — o **Saibaman Verde** (nível 1) paga ~70 Zeni e ~45 XP por vitória — e termina épico: **Broly, o Lendário** (nível 45) paga ~11.000 Zeni e ~8.200 XP. O painel de Batalha mostra os stats de cada vilão, as recompensas e a comparação de [[escala-poder|escala]] com o seu poder atual.',
      },
      {
        kind: 'list',
        items: [
          '**Recompensa de vitória:** Zeni varia ±(10–15%) por luta; XP ±10%. Saiyajin ganha +10% XP.',
          '**Derrota:** você leva 15% do XP do vilão como aprendizado (Zeni só na vitória) — e [[fim-de-luta|hospital]] apenas se for nocaute.',
          'Não existe penalidade diária de farm: cada vitória paga o valor cheio, sempre.',
        ],
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — tabela completa dos 9 vilões',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: 'Vilões (ORIGEM: content/world.ts — ENEMIES; HP = 80 + 15×nível + 5×defesa)',
              headers: ['Vilão', 'Nível', 'HP', 'Zeni (vitória)', 'XP (vitória)'],
              rows: ENEMIES.map((e) => [`${e.emoji} ${e.name}`, String(e.level), br(enemyMaxHp(e)), `~${br(e.zeniReward)}`, `~${br(e.xpReward)}`]),
            },
          },
        ],
      },
    ],
  },

  // ================================================================
  // PvP
  // ================================================================
  {
    id: 'pvp',
    title: 'PvP (Duelos)',
    icon: '🎯',
    group: 'Progressão',
    summary: 'Regras de ataque, roubo de Zeni, política de vida e o Zenkai.',
    resumo: [
      'Ataque guerreiros reais ou bots pelo Ranking — **até 5 níveis de diferença**.',
      'Vencer **rouba 8% do Zeni** da vítima; perder paga 5% do seu.',
      'A vítima é **sempre atacável**; o atacante pode atacar **durante o próprio trabalho** — só não pode estar em luta em andamento.',
    ],
    blocks: [
      {
        kind: 'text',
        text: `Ataque pelo Ranking. As regras: diferença máxima de **${PVP_LEVEL_RANGE} níveis**, atacante com pelo menos **20% de vida** e **${BATTLE_ENERGY_COST} de energia** — e fora de luta em andamento (atacar durante o próprio turno de trabalho é permitido). Quem SOFRE o ataque pode estar fazendo qualquer coisa: o duelo processa por completo. (Entrar na luta com pouca vida por vontade própria é a única punição do atacante descuidado.)`,
      },
      {
        kind: 'table',
        table: {
          caption: 'Consequências do duelo (ORIGEM: actions.ts e activities.ts)',
          headers: ['Resultado', 'Zeni', 'XP'],
          rows: [
            ['Vitória (atacante)', 'Rouba **8%** do Zeni da vítima (mín. 100)', 'Generosa — cresce com o nível do alvo'],
            ['Derrota (atacante)', 'Paga **5%** do próprio Zeni ao vencedor', 'Aprendizado: máx(5; 25 × nível do oponente × 0,4)'],
            ['Vítima', 'Perde o valor roubado (se for derrotada)', 'Nada muda para ela além do Zeni'],
          ],
        },
      },
      {
        kind: 'list',
        items: [
          '**Política de vida:** o desafiante entra com a vida ATUAL (atacar ferido é arriscado); o desafiado entra SEMPRE cheio — sem execuções de alvos baleados.',
          'A iniciativa vem só da Velocidade (empate = moeda) — nenhum lado tem vantagem oculta por atacar.',
          'Bots drenados são reabastecidos para continuarem alvos atrativos.',
        ],
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — fórmula de XP e exemplos',
        blocks: [
          {
            kind: 'text',
            text:
              '**XP de vitória:** `60 × nível do alvo × (1 + 8% por nível acima do seu, limitado a −3)` — mínimo 10. Exemplo real: alvo nível 10 quando você é 8 → 60 × 10 × 1,16 ≈ **696 XP**. Alvo 3+ níveis abaixo paga o mínimo.',
          },
        ],
      },
    ],
  },

  // ================================================================
  // TORNEIO
  // ================================================================
  {
    id: 'torneio',
    title: 'Torneio de Artes Marciais',
    icon: '🏟️',
    group: 'Progressão',
    summary: 'Chave de 8 (Quartas → Semifinal → Final), Cinturão do Campeão, premiação por rodada e cooldown.',
    resumo: [
      'Eliminação direta: **Quartas → Semifinal → GRANDE FINAL**.',
      'A vida **carrega entre as lutas** — e o adversário escala com o seu poder.',
      'Vencer a final vale o **Cinturão do Campeão**; perder elimina e dá cooldown.',
    ],
    blocks: [
      {
        kind: 'text',
        text: `O Torneio é uma campanha de eliminação direta. Cada luta custa energia como qualquer batalha e a **vida carrega entre as lutas** — chegar machucado na final é o preço do caminho (cure com Zeni no meio). O adversário é **elástico**: construído a partir do SEU combatente atual (equipamentos e [[transformacoes|transformação]] contam) — quartas contra ~82% do seu poder, semifinal contra ~95%, final contra um par. A inscrição da campanha custa **${br(TOURNAMENT_ENTRY_FEE)} Zeni** (taxa do comitê, cobrada na luta de abertura).`,
      },
      {
        kind: 'table',
        table: {
          caption: 'Rodadas e premiação (ORIGEM: content/tournament.ts — TOURNAMENT_ROUNDS)',
          headers: ['Rodada', 'Poder do adversário', 'Zeni', 'XP', 'Cristais'],
          rows: TOURNAMENT_ROUNDS.map((r) => [
            r.name,
            `${Math.round(r.powerMult * 100)}% do seu poder`,
            br(r.zeni),
            `${Math.round(r.xpPct * 100)}% do nível atual`,
            r.crystals === 0 ? '—' : String(r.crystals),
          ]),
        },
      },
      {
        kind: 'list',
        items: [
          '**Cinturão do Campeão:** vencer a GRANDE FINAL soma 1 título (conquistas *Campeão Mundial* e *Dinastia do Ringue*).',
          `**Eliminação:** 1 derrota encerra a campanha; o rejeitado leva METADE do XP da rodada (a taxa de inscrição não é devolvida — o comitê tem despesas) — e o comitê reorganiza a chave por **${minutes(TOURNAMENT_COOLDOWN_MS)}** antes da próxima inscrição.`,
          'O painel do Torneio mostra o desafiante da rodada com apelido e provocação — lutadores de elite SEM técnicas/talentos: a vantagem de recursos é sua, a numérica é deles.',
        ],
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — elenco completo da chave de 8',
        blocks: [
          {
            kind: 'text',
            text:
              'Elenco rotativo por campanha (o confronto de cada rodada muda a cada inscrição): ' +
              [...QUARTAS_FIGHTERS, ...SEMI_FIGHTERS, ...FINAL_FIGHTERS].map((f) => `${f.emoji} ${f.name} (${f.epithet})`).join('; ') +
              '.',
          },
        ],
      },
    ],
  },

  // ================================================================
  // WORLD BOSS
  // ================================================================
  {
    id: 'world-boss',
    title: 'Ameaça Universal (Chefe Mundial)',
    icon: '🐲',
    group: 'Progressão',
    summary: 'Chefe com HP global compartilhado: cadência, custo, XP e premiação por posição.',
    resumo: [
      'HP **global compartilhado** — o dano de todos os jogadores soma no mesmo barril.',
      'Cada ataque: **10 ⚡ + 15% da vida atual**, cooldown de 10 s.',
      'É a única ação liberada **mesmo trabalhando**.',
    ],
    blocks: [
      {
        kind: 'text',
        text: `Um chefe colossal com vida compartilhada por todo o servidor. Cada boss dura **${BOSS.durationHours / 24} dias** e o painel mostra a vida, o ranking e o Top 10 em tempo real. Cada ataque seu simula uma sequência de golpes contra a defesa colossal — [[escala-poder|Armadura de Escala]] e [[impeto|Aberturas]] valem aqui também.`,
      },
      {
        kind: 'table',
        table: {
          caption: 'Regras do ataque (ORIGEM: worldboss.ts)',
          headers: ['Regra', 'Valor'],
          rows: [
            ['Custo por ataque', `${BOSS.attackEnergyCost} de energia + 15% da vida ATUAL (desgastante, nunca letal)`],
            ['Vida mínima para atacar', `${Math.round(BOSS.attackMinHpPct * 100)}% da vida máxima`],
            ['Cooldown entre ataques', `${BOSS.attackCooldownSec} segundos`],
            ['XP por ataque', 'dano ÷ 200 (mínimo 20)'],
            ['Atacar durante trabalho?', 'SIM — é a única ação de gameplay sempre liberada'],
          ],
        },
      },
      {
        kind: 'table',
        table: {
          caption: `Premiação quando o chefe cai (participação: dano ≥ ${br(BOSS.minParticipationDamage)})`,
          headers: ['Posição no ranking de dano', 'Zeni', 'Cristais'],
          rows: [
            ['Participação', '300', '1'],
            ['Top 50', '+200', '—'],
            ['Top 10', '+800', '+1'],
            ['Top 3', '+2.000', '+3'],
            ['1º lugar', '+5.000', '+5 + título exclusivo "Caçador de Ameaças"'],
          ],
        },
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — como o dano é calculado',
        blocks: [
          {
            kind: 'text',
            text: 'Cada ataque roda uma sequência de **8 golpes** seus (com técnicas, estratégia e regen de Ki como em batalha, incluindo combos de Ímpeto) contra a defesa colossal do chefe — e a média é **ampliada ×60** para a escala do HP global (mínimo 10 de dano). Ataques simbólicos não recebem recompensa de participação.',
          },
        ],
      },
    ],
  },

  // ================================================================
  // ESFERAS DO DRAGÃO
  // ================================================================
  {
    id: 'esferas-dragao',
    title: 'Esferas do Dragão e Shenlon',
    icon: '🔮',
    group: 'Coleção e Social',
    summary: 'Como coletar as 7 esferas e os 4 desejos do dragão.',
    resumo: [
      'Turnos de [[profissoes|trabalho]] concluídos podem revelar **Esferas** (3% a 10%).',
      'Com as **7**, invoque Shenlon e escolha UM desejo — elas se dispersam.',
      'Colete a conquista *Colecionador de Esferas* **antes** de pedir o desejo.',
    ],
    blocks: [
      {
        kind: 'text',
        text: 'Cada turno de profissão concluído tem chance de revelar uma **Esfera do Dragão** — a chance sobe com o rank (3% a 10%). Junte as **7 esferas**, invoque Shenlon e escolha:',
      },
      {
        kind: 'table',
        table: {
          caption: 'Desejos (ORIGEM: actions.ts — actionWish)',
          headers: ['Desejo', 'Efeito'],
          rows: [
            ['💰 Riqueza', '+8.000 Zeni'],
            ['💪 Poder', '+3 em TODOS os atributos (respeita o teto de 999)'],
            ['❤️ Vitalidade', 'Vida e energia restauradas a 100%'],
            ['📚 Sabedoria', '+1.500 XP'],
          ],
        },
      },
      {
        kind: 'callout',
        tone: 'tip',
        text: 'A conquista *Colecionador de Esferas* pede as 7 ao mesmo tempo — o desejo zera a coleção, então colete a recompensa antes de pedir riqueza.',
      },
    ],
  },

  // ================================================================
  // GUILDAS E TEMPORADAS
  // ================================================================
  {
    id: 'guildas',
    title: 'Guildas e Temporadas',
    icon: '🛡️',
    group: 'Coleção e Social',
    summary: 'Criação, doações, níveis de guilda e o ranking sazonal de 30 dias.',
    resumo: [
      `Fundar custa **${br(GUILD_CREATION_COST)} Zeni**; cabem **${GUILD_MAX_MEMBERS} guerreiros**.`,
      'Doações de Zeni viram XP da guilda — e nível de guilda.',
      `A cada **${SEASON_DAYS} dias** uma temporada encerra; cada vitória vale **${SEASON_POINTS_PER_WIN} pontos** no ranking.`,
    ],
    blocks: [
      {
        kind: 'callout',
        tone: 'tip',
        title: 'O mundo começa com ZERO guildas',
        text: 'O mundo começa com **ZERO guildas**: não existe guilda de sistema nem guilda pronta — **toda guilda do universo foi fundada por um jogador**, e o nome de qualquer guilda extinta volta a ficar livre. Se nenhuma existe ainda, seja o primeiro: reúna 5.000 Zeni, escolha um nome e hasteie sua bandeira.',
      },
      {
        kind: 'list',
        items: [
          'Doações a partir de 100 Zeni; o nível da guilda cresce com o total doado.',
          'O poder somado da guilda posiciona no ranking de guildas; doações contam para a conquista *Mecenas*.',
          `Temporadas: a cada ${SEASON_DAYS} dias o ranking sazonal encerra e outro começa — o progresso permanente do personagem nunca é apagado.`,
        ],
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — fórmula de nível da guilda',
        blocks: [
          {
            kind: 'text',
            text: 'Nível da guilda: `1 + √(XP ÷ 500)` — o próximo nível custa `500 × nível²` de XP acumulado em doações.',
          },
        ],
      },
    ],
  },

  // ================================================================
  // CONQUISTAS E QUESTS
  // ================================================================
  {
    id: 'conquistas',
    title: 'Conquistas e Missões',
    icon: '🏆',
    group: 'Coleção e Social',
    summary: 'Missões diárias/semanais sorteadas, conquistas por métrica e recompensas de coleta.',
    resumo: [
      '**3 missões diárias** (reset à meia-noite de Brasília) e **2 semanais** (segundas).',
      'As mesmas missões se repetem até o reset — dá para planejar o dia.',
      'Conquistas são permanentes; a recompensa é coletada **uma única vez** no painel.',
    ],
    blocks: [
      {
        kind: 'text',
        text: `Missões são sorteadas por personagem e período — hoje você pode pegar "vença 3 batalhas" ou "gaste 60 de energia"; a semana pode pedir 15 vitórias ou 5 lutas de [[torneio|torneio]]. São **${ACHIEVEMENTS.length} conquistas** permanentes, de *Primeiro Sangue* a *Dinastia do Ringue*.`,
      },
      {
        kind: 'callout',
        tone: 'tip',
        text: 'Recompensas de conquista incluem cristais — a principal fonte de 💎 para [[loja|cosméticos]] e equipamentos de treino, junto com o [[world-boss|chefe mundial]].',
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — tabelas completas de missões e conquistas',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: 'Missões diárias possíveis (ORIGEM: content/quests.ts — DAILY_QUESTS)',
              headers: ['Missão', 'Objetivo', 'Zeni', 'XP', '💎'],
              rows: DAILY_QUESTS.map((q) => [`${q.icon} ${q.name}`, q.description, br(q.rewardZeni), br(q.rewardXp), String(q.rewardCrystals)]),
            },
          },
          {
            kind: 'table',
            table: {
              caption: 'Missões semanais possíveis (ORIGEM: content/quests.ts — WEEKLY_QUESTS)',
              headers: ['Missão', 'Objetivo', 'Zeni', 'XP', '💎'],
              rows: WEEKLY_QUESTS.map((q) => [`${q.icon} ${q.name}`, q.description, br(q.rewardZeni), br(q.rewardXp), String(q.rewardCrystals)]),
            },
          },
          {
            kind: 'table',
            table: {
              caption: `Conquistas (${ACHIEVEMENTS.length} no total — ORIGEM: content/quests.ts — ACHIEVEMENTS)`,
              headers: ['Categoria', 'Conquistas'],
              rows: Object.entries(
                ACHIEVEMENTS.reduce<Record<string, string[]>>((acc, a) => {
                  (acc[a.category] ??= []).push(`${a.icon} ${a.name} — ${a.description}`);
                  return acc;
                }, {})
              ).map(([cat, list]) => [cat[0].toUpperCase() + cat.slice(1), list.join(' · ')]),
            },
          },
        ],
      },
    ],
  },

  // ================================================================
  // LOJA E ITENS
  // ================================================================
  {
    id: 'loja',
    title: 'Loja e Itens',
    icon: '🏪',
    group: 'Coleção e Social',
    summary: 'Equipamentos, consumíveis, itens de treino, cosméticos e o Elixir do Dragão.',
    resumo: [
      'Equipamentos de combate custam **Zeni**; consumíveis, treino e cosméticos custam **💎**.',
      'Vender devolve **50%** na moeda original — e cosméticos não são vendíveis.',
      'Empilhe até 999 unidades; até 99 por transação de compra/venda.',
    ],
    blocks: [
      {
        kind: 'text',
        text: `As primeiras compras úteis são baratas: **Luvas de Treino** (300 Zeni) para bater mais forte, **Gi de Batalha** (250 Zeni) para apanhar menos. Mais tarde, a **Espada Z** (6.000 Zeni, +42 de ataque) e o **Manto do Kaioshin** (38.000 Zeni, +100 de defesa) dominam o fim de jogo. Vender devolve ${Math.round(SELL_PRICE_RATIO * 100)}% do preço na mesma moeda.`,
      },
      {
        kind: 'text',
        text: 'Os itens de 💎 cristal fazem o treino render mais: a **Bandana de Treino** (+1 Força por treino) custa 15 💎; a **Sala do Tempo Pessoal** (+3 em todos por treino) custa 450 💎. O **Elixir do Dragão** (75 💎) dá +2 em TODOS os atributos na hora — sem gastar energia.',
      },
      {
        kind: 'list',
        items: [
          'Consumíveis: **Cápsula de Energia** (6 💎) enche a energia; **Feijão Senzu** (10 💎) enche a vida.',
          '**Cosméticos** não alteram atributos — auras, títulos, poses e molduras por cristais; nenhum item vende poder.',
        ],
      },
      {
        kind: 'details',
        summary: '🔍 Detalhes para curiosos — catálogo completo da loja',
        blocks: [
          {
            kind: 'table',
            table: {
              caption: 'Armas e armaduras (ORIGEM: content/world.ts — SHOP_ITEMS)',
              headers: ['Item', 'Categoria', 'Bônus', 'Nível', 'Preço'],
              rows: SHOP_ITEMS.filter((i) => i.category === 'weapon' || i.category === 'armor').map((i) => [
                `${i.icon} ${i.name}`,
                i.category === 'weapon' ? 'Arma (físico)' : 'Armadura (defesa)',
                [
                  i.atk ? `+${i.atk} atk` : null,
                  i.def ? `+${i.def} def` : null,
                  i.spd ? `+${i.spd} vel` : null,
                  i.ki ? `+${i.ki} ki` : null,
                ]
                  .filter(Boolean)
                  .join(' '),
                String(i.minLevel),
                `${br(i.price)} Zeni`,
              ]),
            },
          },
          {
            kind: 'table',
            table: {
              caption: 'Acessórios (ORIGEM: content/world.ts — SHOP_ITEMS)',
              headers: ['Item', 'Bônus', 'Nível', 'Preço'],
              rows: SHOP_ITEMS.filter((i) => i.category === 'accessory').map((i) => [
                `${i.icon} ${i.name}`,
                [i.atk ? `+${i.atk} atk` : null, i.def ? `+${i.def} def` : null, i.spd ? `+${i.spd} vel` : null, i.ki ? `+${i.ki} ki` : null]
                  .filter(Boolean)
                  .join(' '),
                String(i.minLevel),
                `${br(i.price)} Zeni`,
              ]),
            },
          },
          {
            kind: 'table',
            table: {
              caption: 'Consumíveis e itens de treino (custam 💎 — ORIGEM: content/world.ts — SHOP_ITEMS)',
              headers: ['Item', 'Efeito', 'Nível', 'Preço'],
              rows: SHOP_ITEMS.filter((i) => i.category === 'consumable' || i.category === 'training').map((i) => [
                `${i.icon} ${i.name}`,
                i.trainBonus
                  ? `+${Object.entries(i.trainBonus)
                      .map(([k, v]) => `${v} ${k === 'all' ? 'em todos' : STAT_LABELS[k] ?? k}`)
                      .join(' + ')} por treino`
                  : i.effect === 'full_energy'
                    ? 'Energia cheia na hora'
                    : i.effect === 'full_hp'
                      ? 'Vida cheia na hora'
                      : i.effect === 'stat_boost'
                        ? '+2 em TODOS os atributos'
                        : '—',
                String(i.minLevel),
                `${i.price} 💎`,
              ]),
            },
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------
// Utilidades públicas da wiki
// ---------------------------------------------------------------------

/** Texto completo de uma seção (título + resumo + bullets + blocos + tabelas + expandíveis) — index de busca. */
export function sectionSearchText(section: WikiSection): string {
  const parts: string[] = [section.title, section.summary, ...section.resumo];
  const pushBlocks = (blocks: WikiBlock[]): void => {
    for (const block of blocks) {
      if (block.kind === 'text' || block.kind === 'callout') parts.push(block.text);
      else if (block.kind === 'list') parts.push(...block.items);
      else if (block.kind === 'table') {
        parts.push(block.table.caption ?? '', ...block.table.headers, ...block.table.rows.flat());
      } else if (block.kind === 'details') {
        parts.push(block.summary);
        pushBlocks(block.blocks); // conteúdo do expandível fica no DOM — indexado
      }
    }
  };
  pushBlocks(section.blocks);
  return parts.join(' \n ');
}

/** Busca uma seção pelo id (âncoras são estáveis — usada pelos testes de contrato). */
export function getWikiSection(id: string): WikiSection | undefined {
  return WIKI_SECTIONS.find((s) => s.id === id);
}

/** Grupos na ordem de primeira aparição (para o índice lateral). */
export function wikiGroups(): Array<{ name: string; sections: WikiSection[] }> {
  const groups: Array<{ name: string; sections: WikiSection[] }> = [];
  for (const s of WIKI_SECTIONS) {
    let g = groups.find((x) => x.name === s.group);
    if (!g) {
      g = { name: s.group, sections: [] };
      groups.push(g);
    }
    g.sections.push(s);
  }
  return groups;
}
