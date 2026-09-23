import { isIP } from 'node:net';
// =====================================================================
// Rate limiting em memória (proteção contra brute force)
// ---------------------------------------------------------------------
// Suficiente para instância única. Em produção multi-instância, troque
// por Redis (mesma interface) — ver .env.example.
// =====================================================================

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  // limpeza periódica para não vazar memória
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < 3_600_000);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Janela deslizante simples.
 * @param key     identificador (ex.: "login:1.2.3.4")
 * @param limit   máximo de eventos na janela
 * @param windowMs tamanho da janela em ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSec: 0 };
}

/** Extrai o IP do request (atrás de proxy usa x-forwarded-for). */
export function clientIp(request: Request): string {
  // Nunca usa texto arbitrário como chave de bucket: além de permitir
  // bypass por spoof, cabeçalhos enormes/diferentes poderiam inflar o Map.
  // Atrás de um proxy que APPENDA X-Forwarded-For, o último IP é o salto
  // mais próximo e não o valor que o cliente tentou prefixar.
  // Deploy oficial: Render. O proxy da plataforma APPENDA X-Forwarded-For;
  // por isso confiamos somente no ÚLTIMO hop válido dessa cadeia. Cabeçalhos
  // alternativos como cf-connecting-ip/x-real-ip podem ser enviados pelo
  // próprio cliente quando não há um proxy confiável específico na frente
  // e, portanto, não servem como identidade para rate limiting.
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  if (forwarded && forwarded.length <= 64 && isIP(forwarded)) return forwarded;
  return 'unknown';
}

// limites nomeados (centralizados para ajuste fácil)
export const LIMITS = {
  login: { limit: 10, windowMs: 5 * 60_000 },
  register: { limit: 5, windowMs: 30 * 60_000 },
  guest: { limit: 10, windowMs: 60 * 60_000 },
  convert: { limit: 10, windowMs: 60 * 60_000 },
  supabase: { limit: 20, windowMs: 5 * 60_000 }, // ponte de login Supabase (token já validado lá)
  action: { limit: 90, windowMs: 60_000 },
  // worldBoss: REMOVIDO em v0.9.11 — era um número solto (6/60s) que podia
  // divergir do cooldown real. O limite do Ameaça Universal agora é DERIVADO da
  // fonte única (ATTACK_COOLDOWN_SEC em worldboss.ts → bossAttacksPerWindow)
  // e aplicado na rota de ação só para world_boss_attack.
  analytics: { limit: 120, windowMs: 60_000 },
  state: { limit: 60, windowMs: 60_000 }, // polling leve do estado (1/s de teto)
  avatar: { limit: 10, windowMs: 60_000 },
  deleteCharacter: { limit: 6, windowMs: 60_000 },
} as const;
