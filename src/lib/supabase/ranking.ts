// =====================================================================
// Supabase — RANKING PÚBLICO NA NUVEM (v0.9.5, SERVER-SIDE)
// ---------------------------------------------------------------------
// Consulta a RPC `ranking_nuvem` do Postgres (ver supabase-ranking-v2.sql):
// ela lê TODOS os perfis e ordena os personagens AO VIVO — a posição
// NUNCA é gravada, é sempre calculada na hora. Nenhum filtro por
// login/online/sessão: todo personagem salvo no Supabase aparece.
//
// Segurança:
//  * só a chave PUBLICÁVEL (anon) — a página /ranking é pública;
//  * a RPC é security definer mas expõe APENAS nome, raça, nível,
//    vitórias, derrotas e poder (a fórmula do jogo) — nenhum e-mail,
//    nenhum identificador interno, nenhum dado de outros jogadores;
//  * qualquer falha é LOGADA e devolve null — quem chama cai no ranking
//    local (a página nunca quebra).
//
// Degradação graciosa: se o SQL v2 (raça/V-D/posição) ainda não foi
// aplicado, a chamada com p_nome devolve 404 — repetimos SEM p_nome
// (formato antigo) e seguimos com os campos que existirem.
// =====================================================================

import { db } from '@/lib/db';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config';

export interface CloudRankingEntry {
  posicao: number;
  nome: string;
  /** Raça do personagem — null quando a RPC antiga (sem o SQL v2) respondeu. */
  raca: string | null;
  nivel: number;
  poder: number;
  /** Vitórias — null quando a RPC antiga respondeu. */
  vitorias: number | null;
  /** Derrotas — null quando a RPC antiga respondeu. */
  derrotas: number | null;
}

export interface CloudRanking {
  entries: CloudRankingEntry[];
  total: number;
  /** Posição global do personagem p_nome — null se não informado/não encontrado. */
  myPosition: number | null;
}

/** Linha crua que a RPC devolve (qualquer versão). */
export interface CloudRankingRow {
  posicao: number | string | null;
  nome: string | null;
  raca?: string | null;
  nivel: number | string | null;
  vitorias?: number | string | null;
  derrotas?: number | string | null;
  poder: number | string | null;
  total?: number | string | null;
  minha_posicao?: number | string | null;
}

/**
 * Converte as linhas cruas da RPC em entradas do ranking (função pura —
 * testada em tests/v095.test.ts). Campos da versão antiga ficam null.
 */
export function parseCloudRankingRows(rows: CloudRankingRow[]): CloudRanking {
  const entries: CloudRankingEntry[] = rows
    .filter((r) => typeof r?.nome === 'string' && r.nome.length > 0)
    .map((r, i) => ({
      posicao: Number(r.posicao) || i + 1,
      nome: String(r.nome).slice(0, 20),
      raca: r.raca == null ? null : String(r.raca).slice(0, 20),
      nivel: Number(r.nivel) || 1,
      poder: Number(r.poder) || 0,
      vitorias: r.vitorias == null ? null : Math.max(0, Number(r.vitorias) || 0),
      derrotas: r.derrotas == null ? null : Math.max(0, Number(r.derrotas) || 0),
    }));

  const total = Number(rows[0]?.total);
  const myPosition = Number(rows[0]?.minha_posicao);
  return {
    entries,
    total: Number.isFinite(total) && total > 0 ? total : entries.length,
    myPosition: Number.isFinite(myPosition) && myPosition > 0 ? myPosition : null,
  };
}

async function callRankingRpc(args: Record<string, unknown>): Promise<CloudRankingRow[] | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ranking_nuvem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(args),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as CloudRankingRow[];
  return Array.isArray(rows) ? rows : null;
}

/**
 * Top N do ranking global calculado no Postgres a partir dos snapshots
 * em profiles.progresso. `nome` (opcional) devolve a posição global do
 * próprio personagem. Devolve null em qualquer falha (logada).
 */
export async function fetchCloudRanking(
  limit = 25,
  offset = 0,
  nome?: string | null
): Promise<CloudRanking | null> {
  try {
    // ===== 1) formato v2 (raça/V-D/posição) =====
    let rows = await callRankingRpc({
      p_limite: limit,
      p_offset: offset,
      ...(nome ? { p_nome: nome } : {}),
    });

    // ===== 2) SQL v2 ainda não aplicado → tenta o formato antigo =====
    if (rows === null && nome) {
      console.warn(
        '[nuvem] ranking v2 indisponível (SQL novo ainda não aplicado?) — tentando formato antigo'
      );
      rows = await callRankingRpc({ p_limite: limit, p_offset: offset });
    }

    if (rows === null) {
      // TEMPORÁRIO (diagnóstico v0.9.5): falha de ranking nunca é silenciosa
      console.error('[nuvem] FALHA no ranking da nuvem — RPC não respondeu');
      return null;
    }
    return parseCloudRankingRows(rows);
  } catch (err) {
    console.error('[nuvem] FALHA no ranking da nuvem (rede) —', err);
    return null;
  }
}

// ===== Ranking público unificado (nuvem primeiro, servidor como reserva) =====

export interface PublicRankingEntry {
  position: number;
  name: string;
  race: string | null;
  level: number;
  power: number;
  battlesWon: number | null;
  battlesLost: number | null;
}

export interface PublicRanking {
  entries: PublicRankingEntry[];
  total: number;
  fonte: 'nuvem' | 'local';
}

/**
 * Ranking para a página pública /ranking e para a tabela viva do
 * navegador: SEMPRE tenta a nuvem primeiro (todos os personagens
 * salvos, calculados na hora); se a nuvem não responder, usa o banco
 * do servidor do jogo (logado no console — nunca silencioso).
 */
export async function getPublicRanking(limit = 25): Promise<PublicRanking> {
  const cloud = await fetchCloudRanking(limit);
  if (cloud && cloud.entries.length > 0) {
    return {
      entries: cloud.entries.map((e) => ({
        position: e.posicao,
        name: e.nome,
        race: e.raca,
        level: e.nivel,
        power: e.poder,
        battlesWon: e.vitorias,
        battlesLost: e.derrotas,
      })),
      total: cloud.total,
      fonte: 'nuvem',
    };
  }

  // reserva: banco local (a nuvem falhou — já logado acima)
  const players = await db.player.findMany({
    where: { isBot: false },
    orderBy: [{ level: 'desc' }, { battlesWon: 'desc' }, { xp: 'desc' }],
    select: {
      name: true,
      race: true,
      level: true,
      strength: true,
      defense: true,
      speed: true,
      ki: true,
      battlesWon: true,
      battlesLost: true,
    },
    take: limit,
  });
  return {
    entries: players.map((p, i) => ({
      // mesma fórmula do jogo (função técnica scouterPower do /api/game/ranking)
      position: i + 1,
      name: p.name,
      race: p.race,
      level: p.level,
      power: scouterPowerLocal(p),
      battlesWon: p.battlesWon,
      battlesLost: p.battlesLost,
    })),
    total: players.length,
    fonte: 'local',
  };
}

function scouterPowerLocal(p: {
  level: number;
  strength: number;
  defense: number;
  speed: number;
  ki: number;
}): number {
  const atk = Math.round(p.strength * 2.2);
  const kiP = Math.round(p.ki * 2.4);
  const def = Math.round(p.defense * 1.8);
  const res = Math.round(p.defense * 1.1 + p.ki * 0.9);
  return Math.round(p.level * 15 + atk + kiP * 0.9 + def + res * 0.6 + p.speed * 2);
}
