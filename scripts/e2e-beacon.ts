// E2E do beacon: monta um tar.gz no formato real (makeTarGz do app) e
// dispara contra o receptor no dev server. Valida:
//  1. sem segredo → 401
//  2. com segredo válido → snapshot arquivado em db/production-snapshot/
//  3. beacon mais POBRE depois → rejeitado (anti-regressão)
import { makeTarGz } from '../src/lib/game/persistence';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { execSync } from 'child_process';

const SECRET_FILE = 'db/beacon-secrets.txt';
const SECRET = 'e2e-test-secret-abcdef0123456789';

// segredo válido no arquivo (simula o que o build faria)
if (!existsSync(SECRET_FILE)) {
  writeFileSync(SECRET_FILE, `# Segredos do beacon de dados (um por build; append-only; NUNCA apagar)\n${SECRET}\n`);
} else {
  const cur = readFileSync(SECRET_FILE, 'utf8');
  if (!cur.includes(SECRET)) writeFileSync(SECRET_FILE, cur + SECRET + '\n');
}

const dbBytes = readFileSync('/tmp/beacon-e2e/custom.db');
const avatar = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'); // rascunho de PNG
const manifest = {
  origin: 'https://preview-e2e-fake.space-z.ai',
  sentAt: new Date().toISOString(),
  accounts: 1,
  humanPlayers: 1,
  bots: 15,
  purpose: 'beacon',
};

const body = makeTarGz([
  { name: 'custom.db', data: dbBytes },
  { name: 'avatars/avatar_testplayer1_1789000000000.png', data: avatar },
  { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) },
]);
writeFileSync('/tmp/beacon-e2e/beacon.tar.gz', body);
console.log('tar.gz de teste:', body.length, 'bytes');

// 1. sem segredo → 401
const noAuth = execSync(
  `curl -s -o /dev/null -w '%{http_code}' -X POST --data-binary @/tmp/beacon-e2e/beacon.tar.gz http://localhost:3000/api/internal/db-beacon`
).toString();
console.log('sem segredo:', noAuth, noAuth === '401' ? '✓' : '✗ ESPERAVA 401');
if (noAuth !== '401') process.exit(1);

// 2. com segredo → aceito e arquivado
const ok = execSync(
  `curl -s -X POST -H 'x-gm-beacon: ${SECRET}' --data-binary @/tmp/beacon-e2e/beacon.tar.gz http://localhost:3000/api/internal/db-beacon`
).toString();
console.log('com segredo:', ok);
const parsed = JSON.parse(ok);
if (!parsed.ok || !parsed.stored) process.exit(1);
if (parsed.counts.accounts !== 1) process.exit(1);

// snapshot arquivado?
if (!existsSync('db/production-snapshot/custom.db')) {
  console.log('✗ snapshot não foi gravado');
  process.exit(1);
}
const verify = execSync(
  `python3 -c "import sqlite3; con=sqlite3.connect('db/production-snapshot/custom.db'); cur=con.cursor(); cur.execute('SELECT COUNT(*) FROM Account'); print(cur.fetchone()[0])"`
).toString().trim();
console.log('contas no snapshot arquivado:', verify, verify === '1' ? '✓' : '✗');
if (verify !== '1') process.exit(1);

// origin.txt gravada? (habilita pull no build)
const origin = readFileSync('db/production-snapshot/origin.txt', 'utf8').trim();
console.log('origin.txt:', origin, origin === manifest.origin ? '✓' : '✗');

// avatar arquivado?
if (!existsSync('db/production-snapshot/avatars/avatar_testplayer1_1789000000000.png')) {
  console.log('✗ avatar não arquivado');
  process.exit(1);
}
console.log('avatar arquivado ✓');

// 3. beacon mais POBRE (banco vivo, 0 contas) → rejeitado pela anti-regressão
const poor = makeTarGz([{ name: 'custom.db', data: readFileSync('db/custom.db') },
  { name: 'manifest.json', data: Buffer.from(JSON.stringify({ ...manifest, accounts: 0 })) }]);
writeFileSync('/tmp/beacon-e2e/poor.tar.gz', poor);
const poorRes = execSync(
  `curl -s -X POST -H 'x-gm-beacon: ${SECRET}' --data-binary @/tmp/beacon-e2e/poor.tar.gz http://localhost:3000/api/internal/db-beacon`
).toString();
console.log('beacon pobre:', poorRes);
const poorParsed = JSON.parse(poorRes);
if (!poorParsed.ok || poorParsed.stored !== false) process.exit(1);

// snapshot continua com 1 conta
const verify2 = execSync(
  `python3 -c "import sqlite3; con=sqlite3.connect('db/production-snapshot/custom.db'); cur=con.cursor(); cur.execute('SELECT COUNT(*) FROM Account'); print(cur.fetchone()[0])"`
).toString().trim();
console.log('snapshot após beacon pobre:', verify2, verify2 === '1' ? '✓ (anti-regressão funcionou)' : '✗');
if (verify2 !== '1') process.exit(1);

// 4. export endpoint com o mesmo segredo
const exported = execSync(
  `curl -s -o /tmp/beacon-e2e/export.tar.gz -w '%{http_code}' -H 'x-gm-beacon: ${SECRET}' http://localhost:3000/api/admin/db-export`
).toString();
console.log('export endpoint:', exported, exported === '200' ? '✓' : '✗');
if (exported !== '200') process.exit(1);
const expSize = execSync('stat -c%s /tmp/beacon-e2e/export.tar.gz').toString().trim();
console.log('export baixado:', expSize, 'bytes');

// 5. backup do usuário SEM sessão → 401
const backup = execSync(
  `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/game/backup`
).toString();
console.log('backup sem sessão:', backup, backup === '401' ? '✓' : '✗');
if (backup !== '401') process.exit(1);

console.log('\nE2E BEACON: TODOS OS PASSOS PASSARAM');
