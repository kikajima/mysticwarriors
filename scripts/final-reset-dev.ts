// Limpeza final do banco dev — executa o reset geral e mostra o estado.
import { performServerReset } from '../src/lib/game/serverReset';
import { db } from '../src/lib/db';

async function main() {
  const r = await performServerReset('RESET');
  console.log('backup:', r.backupPath);
  console.log('bots:', r.botsReseeded, '| temporada:', r.seasonName);
  console.log('wiped:', JSON.stringify(r.wiped));
  console.log('resetAt:', r.resetAt);
  await db.$disconnect();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
