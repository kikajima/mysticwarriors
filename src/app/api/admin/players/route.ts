import { MAX_ACTION_ENERGY } from '@/lib/game/rules';
import { NextResponse } from 'next/server';
import { toErrorResponse, ApiError, ok } from '@/lib/api';
import { LIMITS, clientIp, rateLimit } from '@/lib/rate-limit';
import { extractBearerToken, verifySupabaseAdmin, adminListCloudCharacters } from '@/lib/supabase/admin';
import { listLocalCharactersForAdmin, type AdminCharacterRow } from '@/lib/game/adminActions';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =====================================================================
// GET /api/admin/players — lista de PERSONAGENS para o painel (v0.9.6)
// ---------------------------------------------------------------------
// AUTORIZAÇÃO EM DUAS CAMADAS (mantida da v0.9):
//  1. O painel só EXISTE no navegador de quem passou na RPC is_admin();
//  2. ESTA ROTA valida de novo, no servidor, chamando a RPC is_admin()
//     do Supabase com o token do próprio usuário (chave publicável —
//     nenhum segredo). Não é admin → 404, como se a rota não existisse.
//
// v0.9.6 (Mudança 4): a lista é de PERSONAGENS (nome, raça, nível,
// poder), não mais de contas. O e-mail da conta dona aparece apenas
// como informação. Fonte: nuvem (todas as linhas de `personagens`) +
// estado local (dados mais frescos de quem está no servidor).
// =====================================================================

function notFound(): NextResponse {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Não encontrado.' } },
    { status: 404 }
  );
}

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Linha de personagem vinda da RPC da nuvem → linha do painel. */
function cloudRowToCharacter(row: {
  id: string;
  user_id: string;
  email: string | null;
  nick: string | null;
  nome: string;
  raca: string;
  nivel: number;
  poder: number;
  vitorias: number;
  derrotas: number;
  estado: unknown;
}): AdminCharacterRow {
  const estado = (row.estado && typeof row.estado === 'object' ? row.estado : {}) as Record<string, unknown>;
  const ki = toInt(estado.ki);
  const level = toInt(row.nivel, 1);
  const defense = toInt(estado.defense);
  return {
    id: row.id,
    name: String(row.nome ?? 'guerreiro'),
    race: String(row.raca ?? ''),
    level,
    power: toInt(row.poder),
    xp: toInt(estado.xp),
    zeni: toInt(estado.zeni),
    crystals: toInt(estado.crystals),
    dragonBalls: Math.min(7, toInt(estado.dragonBalls)),
    energy: toInt(estado.energy),
    maxEnergy: MAX_ACTION_ENERGY, // mesma fórmula do jogo
    hp: toInt(estado.hp),
    maxHp: 80 + level * 15 + defense * 5,
    strength: toInt(estado.strength),
    defense,
    speed: toInt(estado.speed),
    ki,
    battlesWon: toInt(row.vitorias),
    battlesLost: toInt(row.derrotas),
    busy: false, // timers só existem no estado local
    missionEndsAt: null,
    source: 'cloud',
    lastSeenAt: null, // nuvem não expõe "online agora" — sem relógio local
    guildName: null, // a nuvem não espelha guildas — aviso de dissolução não se aplica
    isGuildLeader: false,
    guildMemberCount: null,
    ownerKey: row.user_id,
    ownerEmail: row.email ?? null,
    ownerNick: row.nick ?? row.email?.split('@')[0] ?? null,
    isGuest: false,
  };
}

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request);
    const isAdmin = await verifySupabaseAdmin(token);
    if (!isAdmin || !token) return notFound();

    const rl = rateLimit(`admin-list:${clientIp(request)}`, LIMITS.supabase.limit, LIMITS.supabase.windowMs);
    if (!rl.allowed) throw new ApiError('RATE_LIMITED', 'Muitas consultas. Aguarde um instante.');

    const [cloudRows, localRows, dragonBallWorld] = await Promise.all([
      adminListCloudCharacters(token),
      listLocalCharactersForAdmin(),
      db.dragonBallPossession.findMany({
        orderBy: { star: 'asc' },
        include: { player: { select: { id: true, name: true } } },
      }),
    ]);

    // ===== mescla: LOCAL é mais fresco; NUVEM cobre quem não está aqui =====
    const byId = new Map<string, AdminCharacterRow>();
    for (const local of localRows) {
      byId.set(local.id, local);
    }
    if (cloudRows) {
      for (const row of cloudRows) {
        const existing = byId.get(row.id);
        if (existing) {
          // mesma pessoa nos dois lados → local vence, nuvem complementa
          existing.ownerEmail = row.email ?? existing.ownerEmail;
          if (existing.ownerNick === null && row.nick) existing.ownerNick = row.nick;
        } else {
          byId.set(row.id, cloudRowToCharacter(row));
        }
      }
    } else if (token) {
      // RPC nova ainda não instalada (SQL v0.9.6 pendente) — o painel
      // funciona com o estado local e avisa na interface
      console.warn('[admin] RPC admin_list_personagens indisponível — listando apenas personagens locais (SQL v0.9.6 pendente?)');
    }

    // personagens locais sem dono na nuvem (convidados) já entraram via
    // localRows. Ordenação: mais fortes primeiro (mesma do ranking).
    const characters = Array.from(byId.values()).sort(
      (a, b) => b.level - a.level || b.power - a.power || a.name.localeCompare(b.name)
    );

    return ok({
      characters,
      cloudAvailable: cloudRows !== null,
      dragonBallWorld: dragonBallWorld.map((ball) => ({
        star: ball.star,
        playerId: ball.playerId,
        playerName: ball.player?.name ?? null,
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
