// =====================================================================
// PAINEL DE ADMIN — EXCLUSÕES DESTRUTIVAS (v0.14 · v0.15)
// ---------------------------------------------------------------------
// ERASURE COMPLETO EM DUAS CAMADAS para as ações destrutivas do painel:
//  * excluir PERSONAGEM — cascade local conforme o schema vigente
//    (activities, quests, conquistas, dano a bosses, ledger do
//    personagem, dedups, doações que ELE fez — GuildDonation.playerId
//    é FK Cascade) + a linha espelhada na NUVEM via RPC
//    admin_delete_personagem (mesma path do admin_reset_cloud — SÓ o
//    alvo, nunca a nuvem inteira) + LIMPEZA da conta auth local órfã
//    quando o alvo era SÓ-NUVEM e a conta não tem mais personagens
//    (v0.15 — o painel lista, o painel apaga);
//  * excluir GUILDA — erasure total (regra da tarefa): linha + TODO o
//    histórico de doações (⚠ nesta base GuildDonation.guildId NÃO tem
//    FK — a limpeza é MANUAL aqui, na mesma transação; é o exato bug
//    de classe que uma FK Cascade mataria), nome liberado. Membros
//    ex-guilda ficam SEM guilda (Player.guildId → SET NULL), íntegros.
//    Guilda NÃO é espelhada na nuvem (snapshots de personagem não
//    carregam guildId) → camada nuvem = "not-mirrored".
//
// ORDEM DAS CAMADAS (decisão documentada): NUVEM PRIMEIRO, local
// depois. Se a nuvem falha → NADA morre (aborta limpo). Se a nuvem
// morre e o local falha → 'partial' reportado ALTO — e o estado se
// auto-cura (a linha local re-espelha no próximo sync do dono). O
// caminho inverso (local primeiro) deixaria o personagem ressuscitável
// pelo cloud-restore — pior modo de falha.
//
// PROTEÇÕES (todas server-side, todas auditadas):
//  * BOTS não são excluíveis (conteúdo de sistema — tarefa de dev);
//  * o admin NÃO exclui o PRÓPRIO personagem (mensagem clara);
//  * líder de guilda COMUM: a exclusão DISPARA AUTO-DISSOLUÇÃO da
//    guilda (erasure total) — a UI avisa com o inventário ANTES de
//    confirmar; digitar o nome do personagem confirma tudo.
//  * v0.15 — a proteção "guilda do sistema não é excluível" foi
//    REMOVIDA (OBSOLETA): guilda de sistema não existe mais (decisão
//    do dono — ver DESIGN-DECISIONS.md). TODA guilda listada é de
//    jogador e TODA é excluível.
//
// PÓS-EXCLUSÃO: a MESMA matriz anti-órfã da suíte (orphanCheck.ts —
// fonte única, incluíndo o check LÓGICO de GuildDonation.guildId) roda
// DENTRO da operação. Órfão = a operação REPORTA falha (nunca silencia).
//
// AUDITORIA: toda tentativa (ok, parcial, falha, bloqueio) grava linha
// em AdminActionLog — a tabela SEM FK que sobrevive ao que registra e
// ao reset geral do servidor (accountability não morre com o mundo).
// =====================================================================

import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import { countOrphans, summarizeOrphans } from './orphanCheck';
import {
  adminListCloudCharacters,
  adminDeleteCloudCharacter,
  cloudDeleteRpcStatus,
  explainCloudDeleteProbe,
  type CloudCharacterAdminRow,
  type CloudDeleteResult,
  type CloudDeleteRpcStatus,
} from '@/lib/supabase/admin';

// ===== Tipos =====

type Client = PrismaClient;
type Tx = Prisma.TransactionClient;

/** Backend da camada nuvem (DI — testes herméticos injetam fakes). */
export interface AdminCloudBackend {
  probe(token: string): Promise<CloudDeleteRpcStatus>;
  deleteCharacter(token: string, characterId: string, confirmName: string): Promise<CloudDeleteResult>;
  listCharacters(token: string): Promise<CloudCharacterAdminRow[] | null>;
}

const defaultCloudBackend: AdminCloudBackend = {
  probe: cloudDeleteRpcStatus,
  deleteCharacter: adminDeleteCloudCharacter,
  listCharacters: adminListCloudCharacters,
};

/** Janela que considera um jogador "online/ativo agora" (updatedAt). */
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export interface AdminGuildRow {
  id: string;
  name: string;
  description: string;
  level: number;
  createdAt: string;
  leaderName: string | null;
  memberCount: number;
  memberNames: string[];
  totalDonated: number;
  donationCount: number;
  /** Convites/solicitações assíncronos não existem nesta base — 0 (forward-compat). */
  pendingInvites: number;
  pendingRequests: number;
  /** Membros com atividade nos últimos 10 min (aviso na confirmação). */
  onlineMembers: string[];
}

export interface AdminActionLogView {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetName: string;
  layers: { local: string; cloud: string };
  result: string;
  details: string | null;
  createdAt: string;
}

export interface DeleteCharacterInput {
  characterId: string;
  /** Hint do painel (uuid Supabase ou 'local:...') — o servidor RE-DERIVA. */
  ownerId: string | null;
  /** Nome digitado pelo admin na confirmação dupla. */
  confirmName: string;
  adminEmail: string;
  adminSupabaseUserId: string;
  accessToken: string;
  cloud?: AdminCloudBackend;
  client?: Client;
}

export interface DeleteReport {
  status: 'ok' | 'partial' | 'failed' | 'blocked' | 'precondition' | 'not_found';
  message: string;
  layers: { local: string; cloud: string };
  orphanCheck: { clean: boolean; detail: string };
  guildDissolved?: { name: string; members: number };
}

export interface DeleteGuildInput {
  guildId: string;
  confirmName: string;
  adminEmail: string;
  client?: Client;
}

// ===== Auditoria =====

interface AuditEntry {
  adminEmail: string;
  action: 'delete_character' | 'delete_guild';
  targetType: 'personagem' | 'guilda';
  targetName: string;
  layers: { local: string; cloud: string };
  result: 'ok' | 'partial' | 'failed' | 'blocked';
  details?: Record<string, unknown>;
}

async function writeAudit(client: Client, entry: AuditEntry): Promise<void> {
  try {
    await client.adminActionLog.create({
      data: {
        adminEmail: entry.adminEmail,
        action: entry.action,
        targetType: entry.targetType,
        targetName: entry.targetName,
        layers: JSON.stringify(entry.layers),
        result: entry.result,
        details: entry.details ? JSON.stringify(entry.details) : null,
      },
    });
  } catch (err) {
    // o log JAMAIS derruba a operação — mas o fracasso é gritado
    console.error('[adminErasure] FALHA ao gravar auditoria:', err instanceof Error ? err.message : err);
  }
}

/** Lê o log de ações administrativas (mais recentes primeiro). */
export async function listAuditLogs(limit = 50, client: Client = db): Promise<AdminActionLogView[]> {
  const rows = await client.adminActionLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, limit)),
  });
  return rows.map((r) => {
    let layers: { local: string; cloud: string } = { local: 'na', cloud: 'na' };
    try {
      layers = { ...layers, ...(JSON.parse(r.layers) as { local?: string; cloud?: string }) };
    } catch {
      // layers ilegíveis → 'na'
    }
    return {
      id: r.id,
      adminEmail: r.adminEmail,
      action: r.action,
      targetType: r.targetType,
      targetName: r.targetName,
      layers,
      result: r.result,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ===== Inventário de guildas (para a lista e a confirmação) =====

function guildToRow(
  guild: {
    id: string;
    name: string;
    description: string;
    level: number;
    createdAt: Date;
    totalDonated: number;
    leaderId: string;
  },
  members: Array<{ id: string; name: string; isBot: boolean; updatedAt: Date }>,
  donationCount: number
): AdminGuildRow {
  const now = Date.now();
  const onlineMembers = members
    .filter((m) => !m.isBot && now - m.updatedAt.getTime() < ONLINE_WINDOW_MS)
    .map((m) => m.name);
  const leader = members.find((m) => m.id === guild.leaderId);
  return {
    id: guild.id,
    name: guild.name,
    description: guild.description,
    level: guild.level,
    createdAt: guild.createdAt.toISOString(),
    leaderName: leader?.name ?? null,
    memberCount: members.length,
    memberNames: members.map((m) => m.name),
    totalDonated: guild.totalDonated,
    donationCount,
    // convites/solicitações assíncronos não existem nesta base — 0
    pendingInvites: 0,
    pendingRequests: 0,
    onlineMembers,
  };
}

/** Lista TODAS as guildas com o inventário completo (para exclusão informada). */
export async function listGuildsForAdmin(client: Client = db): Promise<AdminGuildRow[]> {
  const guilds = await client.guild.findMany({ orderBy: [{ level: 'desc' }, { createdAt: 'asc' }] });
  const rows: AdminGuildRow[] = [];
  for (const g of guilds) {
    const [members, donationCount] = await Promise.all([
      client.player.findMany({
        where: { guildId: g.id },
        select: { id: true, name: true, isBot: true, updatedAt: true },
        orderBy: [{ isBot: 'asc' }, { level: 'desc' }],
      }),
      client.guildDonation.count({ where: { guildId: g.id } }),
    ]);
    rows.push(guildToRow(g, members, donationCount));
  }
  return rows;
}

// ===== EXCLUSÃO DE PERSONAGEM =====

interface ResolvedCharacterTarget {
  name: string;
  level: number;
  race: string;
  source: 'local' | 'cloud';
  localPlayerId: string | null;
  /** user_id da nuvem — base para a limpeza da conta auth local órfã. */
  cloudUserId: string | null;
  cloudLinked: boolean;
  ownCharacter: boolean;
  isBot: boolean;
  guild: { id: string; name: string; level: number; leaderId: string; memberNames: string[] } | null;
  isLeader: boolean;
  onlineNow: boolean;
}

interface ResolveOutcome {
  target: ResolvedCharacterTarget | null;
  /** false quando a LISTAGEM da nuvem falhou (RPC admin_list_personagens
   *  indisponível) — sem ela não dá para afirmar que o alvo não existe. */
  cloudListAvailable: boolean;
}

/**
 * Resolve o alvo a partir das DUAS camadas (server-side — o hint do
 * painel nunca é a fonte de verdade). Local vive no banco; cloud-only
 * existe só na tabela `personagens` da nuvem. O outcome distingue
 * "não existe em lugar nenhum" de "não deu para CONSULTAR a nuvem"
 * (v0.15 — falha invisível é como bug de exclusão vira mistério).
 */
async function resolveCharacterTarget(
  client: Client,
  cloud: AdminCloudBackend,
  token: string,
  characterId: string,
  adminSupabaseUserId: string
): Promise<ResolveOutcome> {
  const local = await client.player.findUnique({
    where: { id: characterId },
    include: {
      account: { select: { id: true, supabaseUserId: true } },
      guild: { select: { id: true, name: true, level: true, leaderId: true } },
    },
  });

  if (local) {
    const members = local.guild
      ? await client.player.findMany({
          where: { guildId: local.guild.id },
          select: { name: true },
          orderBy: { isBot: 'asc' },
        })
      : [];
    return {
      cloudListAvailable: true,
      target: {
        name: local.name,
        level: local.level,
        race: local.race,
        source: 'local',
        localPlayerId: local.id,
        cloudUserId: local.account?.supabaseUserId ?? null,
        cloudLinked: local.account?.supabaseUserId != null,
        ownCharacter: local.account?.supabaseUserId === adminSupabaseUserId,
        isBot: local.isBot,
        guild: local.guild
          ? {
              id: local.guild.id,
              name: local.guild.name,
              level: local.guild.level,
              leaderId: local.guild.leaderId,
              memberNames: members.map((m) => m.name),
            }
          : null,
        isLeader: local.guild?.leaderId === local.id,
        onlineNow: !local.isBot && Date.now() - local.updatedAt.getTime() < ONLINE_WINDOW_MS,
      },
    };
  }

  // não existe localmente → procurar na NUVEM (personagem só-nuvem)
  const cloudRows = await cloud.listCharacters(token);
  if (!cloudRows) {
    return { target: null, cloudListAvailable: false };
  }
  const row = cloudRows.find((r) => r.id === characterId) ?? null;
  if (!row) {
    return { target: null, cloudListAvailable: true };
  }
  return {
    cloudListAvailable: true,
    target: {
      name: String(row.nome ?? 'guerreiro'),
      level: Number(row.nivel) || 1,
      race: String(row.raca ?? ''),
      source: 'cloud',
      localPlayerId: null,
      cloudUserId: String(row.user_id ?? '') || null,
      cloudLinked: true,
      ownCharacter: row.user_id === adminSupabaseUserId,
      isBot: false,
      guild: null,
      isLeader: false,
      onlineNow: false,
    },
  };
}

/**
 * Exclui um personagem NAS DUAS CAMADAS (nuvem primeiro, local depois).
 * Ver "ORDEM DAS CAMADAS" no cabeçalho do arquivo.
 */
export async function deleteCharacterAdmin(input: DeleteCharacterInput): Promise<DeleteReport> {
  const client = input.client ?? db;
  const cloud = input.cloud ?? defaultCloudBackend;
  const confirm = input.confirmName.trim();

  const { target, cloudListAvailable } = await resolveCharacterTarget(
    client,
    cloud,
    input.accessToken,
    input.characterId,
    input.adminSupabaseUserId
  );
  if (!target) {
    // v0.15 — TENTATIVA FALHA também é auditada (falha invisível é como
    // bug de exclusão vira mistério), e o motivo distingue "não existe"
    // de "não deu para consultar a nuvem" (listagem indisponível).
    const motivo = cloudListAvailable
      ? 'personagem não encontrado no servidor nem na nuvem (id pode ser de lista antiga)'
      : 'listagem da NUVEM indisponível (RPC admin_list_personagens) — impossível afirmar que o alvo não existe só na nuvem';
    await writeAudit(client, {
      adminEmail: input.adminEmail,
      action: 'delete_character',
      targetType: 'personagem',
      targetName: input.characterId.slice(0, 40),
      layers: { local: 'na', cloud: cloudListAvailable ? 'na' : 'unreachable' },
      result: 'failed',
      details: { motivo, characterId: input.characterId, digitado: confirm || '(vazio)' },
    });
    if (!cloudListAvailable) {
      throw new ApiError(
        'PRECONDITION_FAILED',
        'NADA foi apagado. Não foi possível CONSULTAR a nuvem agora (RPC admin_list_personagens indisponível) — como personagens podem existir SÓ na nuvem, a exclusão aborta em vez de arriscar. Confira a conexão com o Supabase e tente de novo.'
      );
    }
    throw new ApiError(
      'NOT_FOUND',
      'Personagem não encontrado no servidor nem na nuvem. Se ele aparecia na lista, já foi excluído ou o painel está com dados antigos — atualize e tente de novo.'
    );
  }

  const auditBase = {
    adminEmail: input.adminEmail,
    action: 'delete_character' as const,
    targetType: 'personagem' as const,
    targetName: target.name,
  };

  // ===== PROTEÇÕES (bloqueios auditados — nada é apagado) =====
  if (target.isBot) {
    await writeAudit(client, {
      ...auditBase,
      layers: { local: 'na', cloud: 'na' },
      result: 'blocked',
      details: { motivo: 'bot — conteúdo de sistema, exclusão é tarefa de dev' },
    });
    throw new ApiError(
      'VALIDATION_ERROR',
      `"${target.name}" é um BOT — conteúdo de sistema do jogo. Bots não são excluíveis pelo painel; se um bot precisa morrer, é tarefa de dev.`
    );
  }

  if (target.ownCharacter) {
    await writeAudit(client, {
      ...auditBase,
      layers: { local: 'na', cloud: 'na' },
      result: 'blocked',
      details: { motivo: 'próprio personagem do admin' },
    });
    throw new ApiError(
      'VALIDATION_ERROR',
      `"${target.name}" é o SEU personagem (${input.adminEmail}). O admin não exclui o próprio personagem por este caminho — exclua-o dentro do jogo, como qualquer jogador.`
    );
  }

  if (confirm !== target.name) {
    await writeAudit(client, {
      ...auditBase,
      layers: { local: 'na', cloud: 'na' },
      result: 'blocked',
      details: { motivo: 'nome digitado não confere', esperado: target.name, digitado: confirm || '(vazio)' },
    });
    throw new ApiError(
      'VALIDATION_ERROR',
      `O nome digitado não confere. Digite exatamente "${target.name}" para confirmar a exclusão (com acentos e espaços, exatamente como mostrado).`
    );
  }

  // ===== CAMADA NUVEM (primeiro — se falha, NADA morre) =====
  let cloudReport: { deleted: number; backup: number } | null = null;
  if (target.cloudLinked) {
    const probe = await cloud.probe(input.accessToken);
    if (probe !== 'ready') {
      await writeAudit(client, {
        ...auditBase,
        layers: { local: 'na', cloud: 'failed' },
        result: 'failed',
        details: { motivo: 'RPC admin_delete_personagem indisponível', probe, explicacao: explainCloudDeleteProbe(probe) },
      });
      return {
        status: 'precondition',
        message: explainCloudDeleteProbe(probe),
        layers: { local: 'na', cloud: 'failed' },
        orphanCheck: { clean: true, detail: 'nada foi apagado' },
      };
    }
    const deleted = await cloud.deleteCharacter(input.accessToken, input.characterId, confirm);
    if (!deleted.ok) {
      await writeAudit(client, {
        ...auditBase,
        layers: { local: 'skipped', cloud: 'failed' },
        result: 'failed',
        details: { motivo: 'falha ao apagar a linha na nuvem', erro: deleted.error },
      });
      return {
        status: 'failed',
        message: `NADA foi apagado — a exclusão na NUVEM falhou primeiro (${deleted.error}). O personagem segue vivo nas duas camadas; tente de novo.`,
        layers: { local: 'skipped', cloud: 'failed' },
        orphanCheck: { clean: true, detail: 'nada foi apagado' },
      };
    }
    cloudReport = { deleted: deleted.report.personagens_apagados, backup: deleted.report.backup_personagens };
  }

  // ===== CAMADA LOCAL (cascade do schema + auto-dissolução se líder) =====
  if (target.localPlayerId) {
    try {
      const localPlayerId: string = target.localPlayerId;
      const guildOfLeader = target.isLeader ? target.guild : null;
      const guildSnapshot = guildOfLeader
        ? { name: guildOfLeader.name, level: guildOfLeader.level, members: guildOfLeader.memberNames.length }
        : null;

      await client.$transaction(async (tx: Tx) => {
        // líder de guilda comum → AUTO-DISSOLUÇÃO (erasure total): a
        // guilda não pode ficar órfã — morre com o líder, avisada antes.
        if (guildOfLeader) {
          // membros: SEM guilda, estado íntegro
          await tx.player.updateMany({
            where: { guildId: guildOfLeader.id },
            data: { guildId: null },
          });
          // ⚠ doações da guilda: SEM FK de guildId nesta base — limpeza
          // MANUAL na mesma transação (o check lógico da matriz vigia)
          await tx.guildDonation.deleteMany({ where: { guildId: guildOfLeader.id } });
          await tx.guild.delete({ where: { id: guildOfLeader.id } });
        }
        // nunca deixar activePlayerId apontando para um morto
        await tx.account.updateMany({
          where: { activePlayerId: localPlayerId },
          data: { activePlayerId: null },
        });
        // a raiz: o cascade do schema varre o resto (as doações que ELE
        // fez caem pelo FK Cascade de GuildDonation.playerId)
        await tx.player.delete({ where: { id: localPlayerId } });
      });

      // verificação anti-órfã AUTOMÁTICA (a MESMA matriz da suíte,
      // incluíndo o check lógico GuildDonation.guildId)
      const matrix = await countOrphans(client);
      const summary = summarizeOrphans(matrix);

      if (!summary.clean) {
        await writeAudit(client, {
          ...auditBase,
          layers: { local: 'failed', cloud: target.cloudLinked ? 'ok' : 'not-linked' },
          result: 'failed',
          details: { motivo: 'ÓRFÃOS sobreviveram à exclusão', orphanCheck: summary.detail },
        });
        return {
          status: 'failed',
          message: `A exclusão de "${target.name}" DEIXOU ÓRFÃOS (${summary.detail}). A operação é reportada como FALHA — investigue antes de qualquer outra ação.`,
          layers: { local: 'failed', cloud: target.cloudLinked ? 'ok' : 'not-linked' },
          orphanCheck: { clean: false, detail: summary.detail },
          guildDissolved: guildSnapshot ? { name: guildSnapshot.name, members: guildSnapshot.members } : undefined,
        };
      }

      // auditoria principal (fora da transação — registra mesmo em falha)
      await writeAudit(client, {
        ...auditBase,
        layers: { local: 'ok', cloud: target.cloudLinked ? 'ok' : 'not-linked' },
        result: 'ok',
        details: {
          personagem: { nivel: target.level, raca: target.race, fonte: target.source },
          guildDissolved: guildSnapshot,
          nuvem: target.cloudLinked ? cloudReport : 'personagem sem espelho na nuvem',
          orphanCheck: summary.detail,
        },
      });

      // a guilda que morreu com o líder ganha a PRÓPRIA linha de auditoria
      if (guildSnapshot) {
        await writeAudit(client, {
          adminEmail: input.adminEmail,
          action: 'delete_guild',
          targetType: 'guilda',
          targetName: guildSnapshot.name,
          layers: { local: 'ok', cloud: 'not-mirrored' },
          result: 'ok',
          details: {
            guilda: { nivel: guildSnapshot.level, membros: guildSnapshot.members },
            triggeredBy: `exclusão do líder ${target.name}`,
            orphanCheck: summary.detail,
          },
        });
      }

      const nuvemTxt = target.cloudLinked
        ? ` Nuvem: ${cloudReport?.deleted ?? 0} linha(ns) apagada(s) — backup em personagens_backup_reset (${cloudReport?.backup ?? 0} linha(s)).`
        : '';
      const guildaTxt = guildSnapshot
        ? ` Como era LÍDER, a guilda "${guildSnapshot.name}" (nv ${guildSnapshot.level}, ${guildSnapshot.members} membro(s)) foi DISSOLVIDA com erasure total — histórico de doações apagado e nome livre; membros ficaram sem guilda.`
        : '';
      return {
        status: 'ok',
        message: `"${target.name}" foi excluído por completo (${summary.detail}).${nuvemTxt}${guildaTxt}`,
        layers: { local: 'ok', cloud: target.cloudLinked ? 'ok' : 'not-linked' },
        orphanCheck: { clean: true, detail: summary.detail },
        guildDissolved: guildSnapshot ? { name: guildSnapshot.name, members: guildSnapshot.members } : undefined,
      };
    } catch (err) {
      // local falhou DEPOIS da nuvem → 'partial' ALTO (nunca silêncio).
      // O estado se auto-cura: a linha local re-espelha no próximo sync
      // do dono — mas a operação é reportada como incompleta.
      const message = err instanceof Error ? err.message : String(err);
      await writeAudit(client, {
        ...auditBase,
        layers: { local: 'failed', cloud: target.cloudLinked ? 'ok' : 'not-linked' },
        result: 'partial',
        details: { motivo: 'falha na camada LOCAL após a nuvem', erro: message },
      });
      return {
        status: 'partial',
        message: `⚠️ EXCLUSÃO PARCIAL de "${target.name}": a NUVEM foi apagada, mas o SERVIDOR falhou (${message}). O personagem local segue vivo e re-espelhará na nuvem no próximo sync do dono — nada ficou inconsistente, mas a exclusão NÃO está completa. Tente de novo.`,
        layers: { local: 'failed', cloud: target.cloudLinked ? 'ok' : 'not-linked' },
        orphanCheck: { clean: true, detail: 'camada local intocada pela falha' },
      };
    }
  }

  // ===== alvo só-NUVEM: a camada local não existe =====
  // v0.15 — LIMPEZA da conta auth local ÓRFÃ: se existe conta LOCAL
  // vinculada ao user_id da nuvem e ela não tem NENHUM personagem local
  // (nem histórico de carteira — ledger é accountability e fica), a linha
  // é lixo inerte — o painel lista, o painel apaga. O próximo login do
  // dono recria a conta local sob demanda, sem perda alguma.
  let orphanAccountInfo: string;
  if (target.cloudUserId) {
    const localAccounts = await client.account.findMany({
      where: { supabaseUserId: target.cloudUserId },
      include: { _count: { select: { players: true, walletTx: true } } },
    });
    const inert = localAccounts.filter((a) => a._count.players === 0 && a._count.walletTx === 0);
    const withHistory = localAccounts.filter((a) => a._count.walletTx > 0);
    if (inert.length > 0) {
      await client.account.deleteMany({ where: { id: { in: inert.map((a) => a.id) } } });
      orphanAccountInfo = `conta auth local órfã limpa (${inert.length} linha(s) sem personagens nem histórico)`;
    } else if (withHistory.length > 0) {
      orphanAccountInfo = `conta auth local mantida (${withHistory.length} linha(s) com histórico de carteira — ledger é accountability)`;
    } else {
      orphanAccountInfo = 'nenhuma conta auth local vinculada ao dono';
    }
  } else {
    orphanAccountInfo = 'dono sem user_id na nuvem (linha legada)';
  }

  const matrix = await countOrphans(client);
  const summary = summarizeOrphans(matrix);
  await writeAudit(client, {
    ...auditBase,
    layers: { local: 'skipped', cloud: 'ok' },
    result: 'ok',
    details: {
      personagem: { nivel: target.level, raca: target.race, fonte: 'cloud' },
      nuvem: cloudReport,
      contaAuthLocal: orphanAccountInfo,
      orphanCheck: summary.detail,
    },
  });
  return {
    status: 'ok',
    message:
      `"${target.name}" existia apenas na nuvem — a linha espelho foi apagada (${cloudReport?.deleted ?? 0} linha(ns); backup em personagens_backup_reset, ${cloudReport?.backup ?? 0} linha(ns)). ` +
      `Conta auth local: ${orphanAccountInfo}. O dono não verá mais este personagem no próximo login.`,
    layers: { local: 'skipped', cloud: 'ok' },
    orphanCheck: { clean: true, detail: summary.detail },
  };
}

// ===== EXCLUSÃO DE GUILDA =====

/**
 * Exclui uma guilda com ERASURE TOTAL: linha + TODO o histórico de
 * doações (limpeza MANUAL — GuildDonation.guildId não tem FK nesta
 * base) + nome liberado. Membros ex-guilda ficam SEM guilda (SET NULL),
 * íntegros, sem erro. Guilda NÃO é espelhada na nuvem → camada cloud =
 * "not-mirrored".
 */
export async function deleteGuildAdmin(input: DeleteGuildInput): Promise<DeleteReport> {
  const client = input.client ?? db;
  const confirm = input.confirmName.trim();

  const guild = await client.guild.findUnique({
    where: { id: input.guildId },
    include: {
      members: { select: { id: true, name: true, isBot: true, updatedAt: true }, orderBy: { isBot: 'asc' } },
    },
  });
  if (!guild) {
    throw new ApiError('NOT_FOUND', 'Guilda não encontrada.');
  }

  const auditBase = {
    adminEmail: input.adminEmail,
    action: 'delete_guild' as const,
    targetType: 'guilda' as const,
    targetName: guild.name,
  };

  // v0.15 — a proteção "guilda do sistema não é excluível" FOI REMOVIDA
  // (OBSOLETA): guilda de sistema não existe mais (decisão do dono). TODA
  // guilda listada aqui é de jogador e TODA é excluível.

  if (confirm !== guild.name) {
    await writeAudit(client, {
      ...auditBase,
      layers: { local: 'na', cloud: 'na' },
      result: 'blocked',
      details: { motivo: 'nome digitado não confere', esperado: guild.name },
    });
    throw new ApiError(
      'VALIDATION_ERROR',
      `O nome digitado não confere. Digite exatamente "${guild.name}" para confirmar a exclusão.`
    );
  }

  // ===== inventário do que morre junto (para o log e o relatório) =====
  const donationCount = await client.guildDonation.count({ where: { guildId: guild.id } });
  const onlineMembers = guild.members
    .filter((m) => !m.isBot && Date.now() - m.updatedAt.getTime() < ONLINE_WINDOW_MS)
    .map((m) => m.name);

  try {
    await client.$transaction(async (tx: Tx) => {
      // ex-membros: SEM guilda, estado íntegro (SET NULL também cobriria —
      // explícito é melhor que implícito numa ação destrutiva)
      await tx.player.updateMany({
        where: { guildId: guild.id },
        data: { guildId: null },
      });
      // ⚠ TODO o histórico de doações da guilda: SEM FK de guildId nesta
      // base — a limpeza é MANUAL, na MESMA transação (erasure total)
      await tx.guildDonation.deleteMany({ where: { guildId: guild.id } });
      // a linha da guilda (nome, descrição, nível, progresso, totais)
      await tx.guild.delete({ where: { id: guild.id } });
    });

    // verificação anti-órfã automática (inclui o check LÓGICO de doações)
    const matrix = await countOrphans(client);
    const summary = summarizeOrphans(matrix);

    if (!summary.clean) {
      await writeAudit(client, {
        ...auditBase,
        layers: { local: 'failed', cloud: 'not-mirrored' },
        result: 'failed',
        details: { motivo: 'ÓRFÃOS sobreviveram à exclusão', orphanCheck: summary.detail },
      });
      return {
        status: 'failed',
        message: `A exclusão de "${guild.name}" DEIXOU ÓRFÃOS (${summary.detail}). A operação é reportada como FALHA — investigue antes de qualquer outra ação.`,
        layers: { local: 'failed', cloud: 'not-mirrored' },
        orphanCheck: { clean: false, detail: summary.detail },
      };
    }

    await writeAudit(client, {
      ...auditBase,
      layers: { local: 'ok', cloud: 'not-mirrored' },
      result: 'ok',
      details: {
        guilda: { nivel: guild.level, membros: guild.members.length, membrosNomes: guild.members.map((m) => m.name) },
        totalDonated: guild.totalDonated,
        registrosDeDoacao: donationCount,
        membrosOnlineNoMomento: onlineMembers,
        triggeredBy: 'painel admin',
        orphanCheck: summary.detail,
      },
    });

    const onlineTxt =
      onlineMembers.length > 0
        ? ` ${onlineMembers.length} membro(s) estava(m) online no momento (${onlineMembers.join(', ')}) — seguem no jogo, só sem guilda.`
        : '';
    return {
      status: 'ok',
      message:
        `Guilda "${guild.name}" apagada por completo — ${guild.members.length} membro(s) ficaram SEM guilda e íntegros, ` +
        `${donationCount} registro(s) de doação (${guild.totalDonated.toLocaleString('pt-BR')} Zeni históricos) varrido(s) na mesma transação, ` +
        `e o nome "${guild.name}" está LIVRE para reuso. ${summary.detail}.${onlineTxt}`,
      layers: { local: 'ok', cloud: 'not-mirrored' },
      orphanCheck: { clean: true, detail: summary.detail },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeAudit(client, {
      ...auditBase,
      layers: { local: 'failed', cloud: 'not-mirrored' },
      result: 'failed',
      details: { motivo: 'falha na transação local', erro: message },
    });
    return {
      status: 'failed',
      message: `A exclusão de "${guild.name}" FALHOU na transação local (${message}). A operação foi desfeita — nada ficou pela metade. Tente de novo.`,
      layers: { local: 'failed', cloud: 'not-mirrored' },
      orphanCheck: { clean: true, detail: 'transação desfeita' },
    };
  }
}
