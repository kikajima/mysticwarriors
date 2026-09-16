// Smoke v0.9.1 — reset do admin NÃO apaga personagens
// Cria convidado + personagem, evolui um pouco, aplica reset local
// (mesma função que o painel chama) e verifica que o personagem
// CONTINUA EXISTINDO com stats de criação.
import { applyAdminActionLocal } from '../src/lib/game/adminActions';
import { db } from '../src/lib/db';

async function main() {
  // 1. conta convidada + personagem
  const account = await db.account.create({
    data: { username: 'SmokeAdminTest', isGuest: true },
  });
  const player = await db.player.create({
    data: {
      name: 'Rei Teste',
      race: 'saiyajin',
      gender: 'male',
      accountId: account.id,
      level: 30,
      xp: 1234,
      zeni: 98_000,
      crystals: 55,
      strength: 250,
      defense: 180,
      speed: 200,
      ki: 220,
      hp: 900,
      energy: 40,
      dragonBalls: 3,
      battlesWon: 42,
      trainingsDone: 99,
    } as never,
  });
  console.log('criado:', player.name, 'nível', player.level, 'zeni', player.zeni);

  // 2. reset (ação do painel, caminho local — v0.9.6: alvo = personagem)
  const result = await applyAdminActionLocal({
    characterId: player.id,
    ownerId: null,
    action: 'reset',
  });
  console.log('reset ok?', result.ok, '| mensagem:', result.message);

  // 3. personagem AINDA EXISTE?
  const after = await db.player.findFirst({ where: { accountId: account.id, isBot: false } });
  if (!after) throw new Error('FALHOU: personagem foi apagado pelo reset!');
  console.log('personagem após reset:', after.name, 'nível', after.level, 'zeni', after.zeni, 'força', after.strength);
  if (after.name !== 'Rei Teste') throw new Error('FALHOU: nome mudou?');
  if (after.level !== 1) throw new Error('FALHOU: nível não resetou');
  if (after.zeni !== 500) throw new Error('FALHOU: zeni não resetou');
  if (after.strength !== 10) throw new Error('FALHOU: atributo não resetou');
  if (after.crystals !== 55) throw new Error('FALHOU: diamantes deviam ser preservados');
  console.log('OK: personagem MANTIDO com progresso resetado (diamantes preservados).');

  // 4. limpeza (conta e personagem de TESTE criados por este script)
  await db.player.delete({ where: { id: after.id } });
  await db.account.delete({ where: { id: account.id } });
  console.log('limpeza concluída — nada de teste ficou no banco.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
