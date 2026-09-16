import type { RaceId } from '../types';

// =====================================================================
// Gerador de nomes (dado da criação de personagem) + bots de ranking
// ---------------------------------------------------------------------
// POLÍTICA DE NOMES: todos os nomes são ORIGINAIS — "parecem" do
// universo de artes marciais/kiai, mas NENHUM é nome exato de
// personagem da franquia Dragon Ball (sem Goku, Vegeta, Freeza,
// Cell, Kuririn, etc.). Variações fonéticas originais apenas.
// =====================================================================

const NAME_CORES = [
  // linhagem saiyajin (sons "Ka/Ve/Br")
  'Gotan', 'Kota', 'Genki', 'Katen', 'Subun',
  'Kakora', 'Kakin', 'Kakun', 'Kakarun', 'Renkin',
  'Vejun', 'Vegran', 'Vejora', 'Veggor', 'Vejinto',
  'Brolan', 'Brogan', 'Raddon', 'Nappan', 'Zorun',
  'Turlan', 'Cumbra', 'Yamosa', 'Selira', 'Kaizan',
  // linhagem namekuseijin (sons "Pi/Na")
  'Picala', 'Piquen', 'Piccun', 'Piccor', 'Picomai',
  'Dendel', 'Nailo', 'Katats', 'Slugan', 'Pikonar',
  // linhagem imperial do frio (sons "Fri/Ku")
  'Frizex', 'Frizon', 'Frizain', 'Frizor', 'Frizuma',
  'Cooran', 'Koldan', 'Gichamu', 'Sorbetto', 'Aisurom',
  // linhagem bio-androide (sons "Ce")
  'Celum', 'Cellix', 'Cellian', 'Cellor', 'Celuma',
  'Celzar', 'Celon', 'Semic', 'Bioran', 'Nanoss',
  // linhagem humana (sons "Ten/Ku/Ya")
  'Tenshin', 'Tenkai', 'Tensora', 'Tensun', 'Tensai',
  'Kurira', 'Kurizu', 'Yamcho', 'Chiazen', 'Lancha',
  'Pualo', 'Olonga', 'Boran', 'Upao', 'Mairin',
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
  { name: 'Kaoran', race: 'saiyajin' as RaceId, level: 32 },
  { name: 'Príncipe Vejor', race: 'saiyajin' as RaceId, level: 29 },
  { name: 'Majin Bumbo', race: 'majin' as RaceId, level: 27 },
  { name: 'Picolan Daimar', race: 'namekuseijin' as RaceId, level: 25 },
  { name: 'Androide 87', race: 'androide' as RaceId, level: 24 },
  { name: 'Gotan Escarlate', race: 'saiyajin' as RaceId, level: 23 },
  { name: 'Trenzo do Futuro', race: 'humano' as RaceId, level: 21 },
  { name: 'Tenshin Loto', race: 'humano' as RaceId, level: 19 },
  { name: 'Yamcho Lobo', race: 'humano' as RaceId, level: 17 },
  { name: 'Kurira o Careca', race: 'humano' as RaceId, level: 15 },
  { name: 'Chiazen', race: 'humano' as RaceId, level: 12 },
  { name: 'Sembrano 47', race: 'namekuseijin' as RaceId, level: 8 },
  { name: 'Mercenário Toh', race: 'humano' as RaceId, level: 5 },
  { name: 'Raddon Renegado', race: 'saiyajin' as RaceId, level: 4 },
  { name: 'Mestre Kamo', race: 'humano' as RaceId, level: 2 },
];
