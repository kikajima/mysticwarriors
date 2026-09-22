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
  'Aren', 'Varek', 'Solan', 'Kyren', 'Tarek', 'Rovan', 'Seyra', 'Neris',
  'Vael', 'Orin', 'Kael', 'Narel', 'Lyra', 'Thoren', 'Ilyon', 'Meris',
  'Zarek', 'Korin', 'Daven', 'Rhyss', 'Selka', 'Vorak', 'Elian', 'Mira',
  'Astra', 'Noxen', 'Pyran', 'Sylven', 'Caelis', 'Nexar', 'Veyra', 'Orren',
  'Dravik', 'Talys', 'Erynn', 'Valen', 'Kessa', 'Brakk', 'Rhela', 'Tyron',
];
const NAME_TITLES = [
  'Alfa', 'Mestre', 'Capitão', 'Sentinela', 'Arquivista',
  'Guardião', 'Oráculo', 'Vigia', 'Comandante', 'Peregrino',
];
const NAME_EPITHETS = [
  'de Caelum', 'de Pyros', 'de Sylva', 'de Nexus-9', 'do Horizonte',
  'da Matilha', 'do Vazio', 'das Duas Luas', 'o Carmesim', 'o Silencioso',
  'a Tempestade', 'o Errante', 'a Lâmina', 'o Inquebrável', 'do Aether',
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
  { name: 'Vorak da Matilha', race: 'saiyajin' as RaceId, level: 32 },
  { name: 'Seyra de Pyros', race: 'saiyajin' as RaceId, level: 29 },
  { name: 'Noxen do Vazio', race: 'majin' as RaceId, level: 27 },
  { name: 'Narel de Sylva', race: 'namekuseijin' as RaceId, level: 25 },
  { name: 'Unidade NX-87', race: 'androide' as RaceId, level: 24 },
  { name: 'Rovan Carmesim', race: 'saiyajin' as RaceId, level: 23 },
  { name: 'Lyra do Horizonte', race: 'humano' as RaceId, level: 21 },
  { name: 'Kael Prismático', race: 'humano' as RaceId, level: 19 },
  { name: 'Tyron da Arena', race: 'humano' as RaceId, level: 17 },
  { name: 'Mira Inquebrável', race: 'humano' as RaceId, level: 15 },
  { name: 'Veyra de Caelum', race: 'humano' as RaceId, level: 12 },
  { name: 'Sylven das Copas', race: 'namekuseijin' as RaceId, level: 8 },
  { name: 'Brakk Errante', race: 'humano' as RaceId, level: 5 },
  { name: 'Pyran Renegado', race: 'saiyajin' as RaceId, level: 4 },
  { name: 'Mestre Orin', race: 'humano' as RaceId, level: 2 },
];
