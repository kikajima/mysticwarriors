import { existsSync } from 'fs';
import path from 'path';

// Produção: DATABASE_URL absoluto, existente e externo ao diretório do app.
// Desenvolvimento: candidatos locais permitem abrir o projeto extraído.
// O provedor deve montar um volume persistente; caminho externo sozinho
// não garante persistência entre recriações de containers.

/** Extrai o caminho de um `file:...` (descarta query-params). */
function parseFileUrl(url: string | undefined, allowRelative = false): string | undefined {
  if (!url) return undefined;
  const m = url.match(/^file:(.+?)(\?.*)?$/i);
  if (!m) return undefined;
  const p = m[1];
  if (path.isAbsolute(p)) return p;
  // Desenvolvimento/teste podem usar o padrão Prisma file:./arquivo.db.
  // Produção continua exigindo caminho absoluto em volume externo.
  return allowRelative ? path.resolve(process.cwd(), p) : undefined;
}

function dbCandidates(): string[] {
  const out: string[] = [];
  const add = (p: string | undefined) => {
    if (p && !out.includes(p)) out.push(p);
  };

  // 1. DATABASE_URL (absoluto, ou relativo resolvido contra cwd em dev/test)
  add(parseFileUrl(process.env.DATABASE_URL, true));

  // 2. volumes externos de produção (start.sh / plataforma)
  add('/app-data/guerreiros/custom.db');
  add('/data/guerreiros/custom.db');
  add('/var/lib/guerreiros/custom.db');

  // 3. cwd/db (raiz do projeto)
  add(path.join(process.cwd(), 'db', 'custom.db'));

  // 4. standalone (server.js executado de dentro de .next/standalone)
  add(path.join(process.cwd(), '.next', 'standalone', 'db', 'custom.db'));

  return out;
}

/** Caminho absoluto do arquivo SQLite em uso (primeiro candidato existente). */
export function resolveDbFilePath(): string {
  if (process.env.NODE_ENV === 'production') {
    const configured = parseFileUrl(process.env.DATABASE_URL);
    if (!configured) throw new Error('Produção exige DATABASE_URL=file:/caminho/absoluto/em/volume/custom.db.');
    const relative = path.relative(process.cwd(), configured);
    if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
      throw new Error('SQLite de produção deve ficar fora do diretório da aplicação, em volume persistente.');
    }
    if (!existsSync(configured)) throw new Error('Banco configurado não encontrado. Monte/restaure o volume antes de iniciar; fallback desativado.');
    return configured;
  }
  const candidates = dbCandidates();
  for (const c of candidates) {
    try {
      if (existsSync(c)) return c;
    } catch {
      //_fs indisponível (edge?) — segue para o próximo
    }
  }
  return candidates[0] ?? path.join(process.cwd(), 'db', 'custom.db');
}

/** URL `file:` pronta para o Prisma (datasource override). */
export function resolveDbUrl(): string {
  // SQLite tem um único escritor. Uma conexão evita que uma gravação avulsa
  // bloqueie a conexão de uma transação que ainda precisa executar/commitar.
  // A fila do pool também cobre state, temporadas, dedup e rotas administrativas.
  return `file:${resolveDbFilePath()}?connection_limit=1&socket_timeout=15`;
}
