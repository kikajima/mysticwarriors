import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import sharp from 'sharp';
import { ApiError } from '@/lib/api';
import { resolveDbFilePath } from '@/lib/db-path';

// =====================================================================
// AVATARES — armazenamento PERSISTENTE e serving estável (v0.4)
// ---------------------------------------------------------------------
// PROBLEMA RESOLVIDO: o upload antigo gravava em process.cwd()/public/
// avatars — dentro do PACOTE DE BUILD. Em output standalone o Next não
// serve arquivos adicionados a public/ APÓS o build, e uma nova
// publicação apagava os retratos.
//
// SOLUÇÃO:
//  * os arquivos vivem no MESMO volume persistente do banco (diretório
//    `avatars` irmão do custom.db, resolvido via DATABASE_URL);
//  * são servidos pela rota /api/game/avatars/<nome> (leitura em
//    runtime, cache imutável — o nome carrega timestamp único);
//  * uploads E URLs externas são VALIDADOS por decodificação real
//    (sharp) e espelhados localmente: link de página, imagem inexistente,
//    conteúdo inválido, timeout e bloqueio de provedor são detectados
//    NO MOMENTO DA TROCA;
//  * a busca de URL externa é protegida contra SSRF (IPs privados,
//    redirecionamentos inseguros, arquivos excessivos) — nunca um
//    proxy aberto: baixamos apenas imagens <5MB, https, 1 vez.
// =====================================================================

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_AVATAR_PIXELS = 16_000_000; // 4000×4000 — anti decompression bomb

function productionUsesPostgres(): boolean {
  return process.env.NODE_ENV === 'production' && /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL ?? '');
}

/** Nome de arquivo válido de avatar (gerado SEMPRE pelo servidor). */
const AVATAR_NAME_RE = /^avatar_[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

/**
 * Diretório persistente de avatares — irmão do banco de dados
 * (mesmo volume/backup do DATABASE_URL). Override via AVATAR_DATA_DIR.
 */
export function avatarDataDir(): string {
  const env = process.env.AVATAR_DATA_DIR;
  if (env) return env;
  if (productionUsesPostgres()) {
    throw new ApiError(
      'AVATAR_STORAGE_UNAVAILABLE',
      'Uploads persistentes usam o Supabase Storage. Entre/salve sua conta e tente novamente.'
    );
  }
  // v0.9.14 — caminho resolvido de forma PORTÁVEL (candidates que existem
  // no disco), não o DATABASE_URL cru (absoluto do sandbox de dev).
  return path.join(path.dirname(resolveDbFilePath()), 'avatars');
}

/**
 * v0.9.2 — CANDIDATOS de diretório para avatares, em ordem de preferência.
 *
 * POR QUÊ: em produção a plataforma pode fornecer um DATABASE_URL externo
 * (volume de dados) enquanto o diretório do app é somente-leitura — o
 * antigo fallback (cwd/data/avatars) falhava com EROFS/ENOENT e o upload
 * do jogador dava erro. A lista cobre os layouts conhecidos + tmp do SO
 * (último recurso: sempre gravável; melhor um avatar temporário do que
 * nenhum).
 */
function avatarDirCandidates(): string[] {
  const dirs: string[] = [];
  const add = (d: string | undefined) => {
    if (d && !dirs.includes(d)) dirs.push(d);
  };
  add(process.env.AVATAR_DATA_DIR || undefined);

  // Render Free + PostgreSQL não possui filesystem persistente. URLs
  // legadas /api/game/avatars/* simplesmente retornam 404 se não houver
  // AVATAR_DATA_DIR explícito; novos uploads autenticados usam Storage.
  if (productionUsesPostgres()) return dirs;

  // SQLite local/legado: irmão do banco resolvido.
  add(path.join(path.dirname(resolveDbFilePath()), 'avatars'));
  // volumes externos do start.sh (produção)
  add('/app-data/guerreiros/avatars');
  add('/data/guerreiros/avatars');
  add('/var/lib/guerreiros/avatars');
  add(path.join(process.cwd(), 'data', 'avatars'));
  // último recurso: tmp do sistema (sempre gravável)
  add(path.join(os.tmpdir(), 'guerreiros-avatars'));
  return dirs;
}

/** Diretório gravável escolhido (memoizado por processo — padrão singleton). */
const avatarWritableState = globalThis as unknown as { __gmAvatarDir?: string | null };

async function resolveWritableAvatarDir(): Promise<string> {
  if (avatarWritableState.__gmAvatarDir) return avatarWritableState.__gmAvatarDir;
  for (const dir of avatarDirCandidates()) {
    try {
      await mkdir(dir, { recursive: true });
      const probe = path.join(dir, '.write-probe');
      await writeFile(probe, 'ok');
      await readFile(probe);
      avatarWritableState.__gmAvatarDir = dir;
      return dir;
    } catch {
      // tenta o próximo candidato
    }
  }
  throw new ApiError('AVATAR_STORAGE_UNAVAILABLE', 'Nenhum diretório de armazenamento disponível para avatares.');
}

export async function ensureAvatarDir(): Promise<string> {
  return resolveWritableAvatarDir();
}

/** Detecta o tipo real da imagem pelos magic bytes do buffer. */
export function sniffImageType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

/**
 * Valida que os bytes formam uma imagem REALMENTE decodificável —
 * assinatura inicial não basta: o sharp decodifica e re-encoda uma
 * miniatura, provando que o conteúdo inteiro é uma imagem íntegra
 * (bloqueia arquivos truncados, payloads disfarçados e HTML/páginas).
 */
export async function validateImageBytes(bytes: Buffer): Promise<'jpg' | 'png' | 'webp'> {
  const kind = sniffImageType(bytes);
  if (!kind) {
    throw new ApiError('AVATAR_INVALID_TYPE', 'O arquivo não é uma imagem JPG, PNG ou WebP válida.');
  }
  try {
    const meta = await sharp(bytes, { limitInputPixels: MAX_AVATAR_PIXELS }).metadata();
    if (
      !meta.format ||
      !meta.width ||
      !meta.height ||
      meta.width < 8 ||
      meta.height < 8 ||
      meta.width * meta.height > MAX_AVATAR_PIXELS
    ) {
      throw new Error('dimensões/formato inválidos');
    }
    // decodificação completa: renderiza uma miniatura a partir dos bytes
    await sharp(bytes, { limitInputPixels: MAX_AVATAR_PIXELS })
      .resize(96, 96, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toBuffer();
    return kind;
  } catch {
    throw new ApiError('AVATAR_INVALID_TYPE', 'A imagem está corrompida ou não pôde ser decodificada.');
  }
}

/** Salva os bytes validados e devolve a URL pública estável. */
export async function saveAvatarFile(playerId: string, kind: 'jpg' | 'png' | 'webp', bytes: Buffer): Promise<string> {
  if (productionUsesPostgres()) {
    throw new ApiError(
      'AVATAR_STORAGE_UNAVAILABLE',
      'No Render Free, o avatar deve ser salvo no Supabase Storage. Entre/salve sua conta e tente novamente.'
    );
  }
  const dir = await ensureAvatarDir();
  const safeId = playerId.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `avatar_${safeId}_${Date.now()}.${kind}`;
  await writeFile(path.join(dir, filename), bytes);
  return `/api/game/avatars/${filename}`;
}

/** Lê um avatar pelo nome (validado) — usado pela rota de serving.
 * v0.9.2: busca em TODOS os diretórios candidatos (união) — um avatar
 * gravado por uma versão anterior em outro layout continua acessível. */
export async function readAvatarFile(filename: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!AVATAR_NAME_RE.test(filename)) return null;
  const dirs = avatarDirCandidates();
  const seen = new Set<string>();
  for (const dir of dirs) {
    const base = path.resolve(dir);
    if (seen.has(base)) continue;
    seen.add(base);
    const resolved = path.resolve(base, filename);
    // anti path-traversal: o caminho resoluto precisa ficar DENTRO do dir
    if (!resolved.startsWith(base + path.sep)) continue;
    try {
      const bytes = await readFile(resolved);
      const ext = filename.split('.').pop() as 'jpg' | 'png' | 'webp';
      const contentType = ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
      return { bytes, contentType };
    } catch {
      // não neste diretório — tenta o próximo
    }
  }
  return null;
}

// ===== Busca segura de URL externa (anti-SSRF — nunca um proxy aberto) =====

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 6) {
    const v6 = ip.toLowerCase();
    return (
      v6 === '::1' ||
      v6 === '::' ||
      v6.startsWith('fc') ||
      v6.startsWith('fd') ||
      v6.startsWith('fe80')
    );
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return true;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reservado
  return false;
}

async function resolvePublicHttpsHost(hostname: string): Promise<string> {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new ApiError('AVATAR_INVALID_URL', 'Endereços internos não são permitidos para avatares.');
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new ApiError('AVATAR_INVALID_URL', 'Endereços internos não são permitidos para avatares.');
    }
    return host;
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new ApiError('AVATAR_INVALID_URL', 'Não foi possível encontrar o endereço da imagem.');
  }
  if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) {
    throw new ApiError('AVATAR_INVALID_URL', 'Endereços internos não são permitidos para avatares.');
  }
  return records[0].address;
}

function pinnedHttpsGet(url: URL, address: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname: address,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        servername: url.hostname,
        headers: {
          host: url.host,
          'user-agent': 'MystKiWarriors-AvatarCheck/1.0',
          accept: 'image/*',
        },
      },
      resolve
    );
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

/**
 * Baixa a imagem externa com proteção completa:
 *  * apenas HTTPS (evita conteúdo misto bloqueado pelo navegador);
 *  * DNS resolvido e validado ANTES de cada conexão (anti-SSRF);
 *  * redirecionamentos seguidos MANUALMENTE com revalidação (máx. 3);
 *  * timeout de 8s e teto de 5MB (Content-Length + leitura limitada).
 */
export async function fetchExternalImage(rawUrl: string): Promise<Buffer> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new ApiError('AVATAR_INVALID_URL', 'URL de imagem inválida.');
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'https:') {
      throw new ApiError(
        'AVATAR_INVALID_URL',
        'Use um link HTTPS — o navegador bloqueia imagens HTTP em páginas seguras.'
      );
    }
    // Resolve UMA vez, valida TODOS os endereços e conecta diretamente ao
    // IP validado. Assim o fetch não faz um segundo DNS lookup suscetível a
    // rebinding entre a checagem anti-SSRF e a conexão.
    const address = await resolvePublicHttpsHost(current.hostname);

    let res: IncomingMessage;
    try {
      res = await pinnedHttpsGet(current, address);
    } catch {
      throw new ApiError('AVATAR_INVALID_URL', 'Não foi possível baixar a imagem (timeout ou conexão recusada).');
    }

    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      const rawLoc = res.headers.location;
      const loc = Array.isArray(rawLoc) ? rawLoc[0] : rawLoc;
      res.resume();
      if (!loc) {
        throw new ApiError('AVATAR_INVALID_URL', 'O link não devolveu uma imagem.');
      }
      try {
        current = new URL(loc, current);
      } catch {
        throw new ApiError('AVATAR_INVALID_URL', 'Redirecionamento inválido.');
      }
      continue;
    }
    if (status < 200 || status >= 300) {
      res.destroy();
      throw new ApiError(
        'AVATAR_INVALID_URL',
        `O link não é uma imagem utilizável (resposta ${status}). Verifique se é o endereço DIRETO da imagem.`
      );
    }

    const declaredRaw = res.headers['content-length'];
    const declared = Number(Array.isArray(declaredRaw) ? declaredRaw[0] : declaredRaw ?? 0);
    if (declared > MAX_AVATAR_BYTES) {
      res.destroy();
      throw new ApiError('AVATAR_TOO_LARGE', 'A imagem excede 5 MB.');
    }
    const ctypeRaw = res.headers['content-type'];
    const ctype = String(Array.isArray(ctypeRaw) ? ctypeRaw[0] : ctypeRaw ?? '').toLowerCase();
    if (ctype && !ctype.startsWith('image/') && ctype !== 'application/octet-stream') {
      res.destroy();
      throw new ApiError('AVATAR_INVALID_URL', 'O link aponta para uma página, não para uma imagem.');
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res) {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += value.byteLength;
      if (total > MAX_AVATAR_BYTES) {
        res.destroy();
        throw new ApiError('AVATAR_TOO_LARGE', 'A imagem excede 5 MB.');
      }
      chunks.push(value);
    }
    if (total === 0) {
      throw new ApiError('AVATAR_INVALID_URL', 'O link não devolveu conteúdo de imagem.');
    }
    return Buffer.concat(chunks);
  }
  throw new ApiError('AVATAR_INVALID_URL', 'Redirecionamentos em excesso.');
}
