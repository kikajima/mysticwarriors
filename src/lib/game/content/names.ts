import type { RaceId } from '../types';

// =====================================================================
// Gerador de nomes (dado da criação de personagem) + bots de ranking
// ---------------------------------------------------------------------
// POLÍTICA DE NOMES: todos os nomes são ORIGINAIS — "parecem" do
// universo de artes marciais/kiai, mas NENHUM é nome exato de
// personagem da franquia Myst Ki Warriors (sem Goku, Vegeta, Freeza,
// Cell, Kuririn, etc.). Variações fonéticas originais apenas.
// =====================================================================

const NAME_CORES = [
  'Kael', 'Voran', 'Sorin', 'Tarek', 'Rhyss', 'Auron', 'Selkar', 'Neris', 'Vael', 'Orun',
  'Sylven', 'Thyra', 'Elyon', 'Maelis', 'Veyra', 'Nym', 'Cael', 'Ilyr', 'Seren', 'Ruun',
  'Nexar', 'Cyron', 'Tessel', 'Vektor', 'Axiom', 'Nyxen', 'Kovar', 'Zerin', 'Omra', 'Prax',
  'Moroq', 'Lumen', 'Vesh', 'Astra', 'Kair', 'Ravel', 'Oryn', 'Talos', 'Varyn', 'Sable',
];
const NAME_TITLES = [
  'Príncipe', 'Mestre', 'Grande', 'Capitão', 'General', 'Lorde',
  'Doutor', 'Guardião', 'Místico', 'Xamã',
];
const NAME_EPITHETS = [
  'o Lendário', 'o Renegado', 'do Deserto', 'das Estrelas', 'o Imortal', 'o Dourado',
  'o Sombrio', 'o Invicto', 'o Errante', 'do Futuro', 'o Supremo', 'o Carmesim',
  'o Relâmpago', 'o Dragão', 'a Fera', 'o Silencioso',
];

/** Sorteia um nome de guerreiro no estilo do universo (original, sem cópias). */
export function randomWarriorName(): string {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const roll = Math.random();
  let name: string;
  if (roll < 0.45) {
    name = `${pick(NAME_TITLES)} ${pick(NAME_CORES)}`;
  } else if (roll < 0.8) {
    name = `${pick(NAME_CORES)} ${pick(NAME_EPITHETS)}`;
  } else {
    name = pick(NAME_CORES);
  }
  return name.length > 20 ? name.slice(0, 20).trim() : name;
}

// ===== Bots do ranking (PvP) — nomes originais =====

export const BOTS = [
  { name: 'Kael Voran', race: 'Solaris' as RaceId, level: 32 },
  { name: 'Rhyss da Matilha', race: 'Solaris' as RaceId, level: 29 },
  { name: 'Moroq do Vazio', race: 'majin' as RaceId, level: 27 },
  { name: 'Vaelor Syl', race: 'Verdant' as RaceId, level: 25 },
  { name: 'Nexus-87', race: 'androide' as RaceId, level: 24 },
  { name: 'Sorin Escarlate', race: 'Solaris' as RaceId, level: 23 },
  { name: 'Tarek do Horizonte', race: 'humano' as RaceId, level: 21 },
  { name: 'Sahir Venn', race: 'humano' as RaceId, level: 19 },
  { name: 'Ravel Lobo', race: 'humano' as RaceId, level: 17 },
  { name: 'Tarin Sol', race: 'humano' as RaceId, level: 15 },
  { name: 'Maelis', race: 'humano' as RaceId, level: 12 },
  { name: 'Sylven-47', race: 'Verdant' as RaceId, level: 8 },
  { name: 'Mercenário Kovar', race: 'humano' as RaceId, level: 5 },
  { name: 'Auron Renegado', race: 'Solaris' as RaceId, level: 4 },
  { name: 'Mestre Orun', race: 'humano' as RaceId, level: 2 },
];
