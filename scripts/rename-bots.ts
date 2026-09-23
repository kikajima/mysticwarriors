/**
 * Renomeia os bots do ranking para nomes ORIGINAIS (nenhum nome exato
 * da identidade anterior). Preserva IDs, stats, histórico e tudo mais —
 * é um UPDATE pontual por nome, nunca delete/recreate.
 *
 * Uso: bun scripts/rename-bots.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// nome antigo (banco) → nome novo (names.ts atual)
const RENAMES: Record<string, string> = {
  Kakaroto: 'Kaoran',
  'Príncipe Vegeta': 'Príncipe Vejor',
  'Majin Boo': 'Majin Bumbo',
  'Piccolo Daimao': 'Picolan Daimar',
  'Androide 18': 'Androide 87',
  'Son Gohan': 'Gotan Escarlate',
  'Trunks do Futuro': 'Trenzo do Futuro',
  Tenshinhan: 'Tenshin Loto',
  'Yamcha Lobo': 'Yamcho Lobo',
  'Kuririn careca': 'Kurira o Careca',
  Chiaotzu: 'Chiazen',
  'Saibaman 47': 'Sembrano 47',
  'Tao Pai Pai': 'Mercenário Toh',
  'Raditz Renegado': 'Raddon Renegado',
  'Mestre Kame': 'Mestre Kamo',
};

async function main() {
  console.log('=== RENOMEAÇÃO DE BOTS (nomes originais, sem IPs da franquia) ===');
  let renamed = 0;
  for (const [oldName, newName] of Object.entries(RENAMES)) {
    const existingNew = await db.player.findUnique({ where: { name: newName } });
    if (existingNew) {
      console.log(`= ${newName} já existe (ok, nada a fazer)`);
      continue;
    }
    const res = await db.player.updateMany({
      where: { name: oldName, isBot: true },
      data: { name: newName },
    });
    if (res.count > 0) {
      renamed += res.count;
      console.log(`✓ ${oldName} → ${newName}`);
    } else {
      console.log(`- ${oldName}: não encontrado (talvez já renomeado)`);
    }
  }
  const bots = await db.player.count({ where: { isBot: true } });
  const humans = await db.player.count({ where: { isBot: false } });
  console.log(`\nBots renomeados: ${renamed}`);
  console.log(`Contagem final: ${bots} bots, ${humans} humano(s)`);
}

main()
  .catch((e) => {
    console.error('FALHA:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
