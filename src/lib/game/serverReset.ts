import { mkdir, readdir, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api';
import { ensureSeed } from './engine';
import { ensureActiveSeason } from '@/lib/seasons';
import { isPostgresDatabase, makeBackupTarGz, resolveAvatarsDir, resolveDbFilePath } from './persistence';

// =====================================================================
// RESET GERAL DO SERVIDOR (v0.9.10 — Mudança 3)
// ---------------------------------------------------------------------
// Apaga TODO dado de jogador do banco do jogo (SQLite/Prisma — o estado
// vivo e autoritativo), mantendo apenas configuração:
//   * MANTÉM: GameMeta (versão de balanceamento etc.) e o esquema;
//   * APAGA: personagens (jogadores E bots — bots são re-semeados na
//     sequência), contas/sessões locais, guildas, ledger da carteira,
//     compras, cosméticos, quests, conquistas, atividades, temporada +
//     ranking, Ameaça Universal + danos, analytics e dedup.
//   * Ameaça Universal: as linhas somem e o próximo acesso gera um boss NOVO
//     com timestamps de spawn atuais (geração preguiçosa — ensureActiveBoss).
//
// SEGURANÇA CONTRA RESSURREIÇÃO (a parte crítica):
//   O reset grava GameMeta.serverResetAt. A reconciliação anti-wipe do
//   boot (reconcileDataOnBoot) NUNCA adota um seed do pacote cujo
//   serverResetAt seja mais ANTIGO que o do banco vivo — um snapshot
//   antigo e "rico" (pré-reset) jamais repopula uma produção resetada.
//
// NADA falha em silêncio:
//   * PostgreSQL: export lógico é persistido em game.ServerResetBackup;
//   * SQLite legado/teste: VACUUM INTO cria snapshot físico;
//   * qualquer falha de backup aborta o reset ANTES das exclusões;
//   * no PostgreSQL, avatares vivem no Supabase Storage e não são apagados
//     pelo reset local do servidor.
// =====================================================================

export interface ServerResetReport {
  ok: true;
  backupPath: string;
  backupBytes: number;
  wiped: Record<string, number>;
  botsReseeded: number;
  seasonName: string;
  avatarsDeleted: number;
  avatarFailures: number;
  resetAt: string;
}

/** Contagens pré-wipe (para o relatório e para o log do reset). */
async function countAll(): Promise<Record<string, number>> {
  const [
    accounts,
    sessions,
    humanPlayers,
    bots,
    guilds,
    guildDonations,
    walletTx,
    quests,
    achievements,
    bosses,
    bossDamages,
    seasons,
    seasonRanks,
    purchases,
    cosmetics,
    activities,
    analytics,
    dedups,
  ] = await Promise.all([
    db.account.count(),
    db.session.count(),
    db.player.count({ where: { isBot: false } }),
    db.player.count({ where: { isBot: true } }),
    db.guild.count(),
    db.guildDonation.count(),
    db.walletTransaction.count(),
    db.questProgress.count(),
    db.achievementState.count(),
    db.worldBoss.count(),
    db.worldBossDamage.count(),
    db.season.count(),
    db.seasonRankEntry.count(),
    db.purchase.count(),
    db.cosmeticOwned.count(),
    db.activity.count(),
    db.analyticsEvent.count(),
    db.requestDedup.count(),
  ]);
  return {
    contas: accounts,
    sessoes: sessions,
    personagens: humanPlayers,
    bots: bots,
    guildas: guilds,
    doacoes: guildDonations,
    transacoes_carteira: walletTx,
    missoes_diarias_semanais: quests,
    conquistas: achievements,
    chefes_globais: bosses,
    danos_chefe: bossDamages,
    temporadas: seasons,
    rankings_temporada: seasonRanks,
    compras: purchases,
    cosméticos: cosmetics,
    atividades: activities,
    eventos_analytics: analytics,
    dedups: dedups,
  };
}

/** Backup consistente ANTES do reset.
 * PostgreSQL: export lógico persistido no próprio banco, fora das tabelas
 * apagadas pelo reset. SQLite: mantém o VACUUM INTO legado/teste. */
async function backupDatabase(): Promise<{ path: string; bytes: number }> {
  if (isPostgresDatabase()) {
    const exported = await makeBackupTarGz('user-backup', 'server-reset');
    const row = await db.serverResetBackup.create({
      data: {
        payload: exported.body,
        manifest: JSON.stringify(exported.manifest),
      },
      select: { id: true },
    });
    return {
      path: `postgres:ServerResetBackup:${row.id}`,
      bytes: exported.body.length,
    };
  }

  const dbPath = resolveDbFilePath();
  const backupsDir = path.join(path.dirname(dbPath), 'backups');
  await mkdir(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupsDir, `reset-backup-${stamp}.db`);
  if (existsSync(target)) {
    throw new ApiError('INTERNAL', `Backup de reset já existe: ${target}`);
  }
  try {
    await db.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } catch (err) {
    throw new ApiError(
      'INTERNAL',
      `Não foi possível gerar o backup do banco antes do reset (${err instanceof Error ? err.message : String(err)}) — reset ABORTADO, nenhum dado foi apagado.`
    );
  }
  const st = await stat(target);
  if (!st.isFile() || st.size < 512) {
    throw new ApiError('INTERNAL', `Backup de reset inválido (${target}) — reset ABORTADO.`);
  }
  return { path: target, bytes: st.size };
}

/** Remove os retratos enviados (arquivos órfãos de personagens apagados). */
async function cleanAvatarFiles(): Promise<{ deleted: number; failed: number }> {
  // Em PostgreSQL/Render Free os uploads autenticados vivem no Supabase
  // Storage. O reset do servidor não apaga arquivos da conta do usuário.
  if (isPostgresDatabase()) return { deleted: 0, failed: 0 };

  const dir = resolveAvatarsDir();
  if (!existsSync(dir)) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const f of await readdir(dir)) {
    const fp = path.join(dir, f);
    try {
      const st = await stat(fp);
      if (st.isFile()) {
        await rm(fp, { force: true });
        deleted++;
      }
    } catch {
      failed++;
    }
  }
  return { deleted, failed };
}

/**
 * Executa o reset geral. Confirmação obrigatória: confirm === 'RESET'
 * (checado TAMBÉM na rota — defesa em profundidade).
 */
export async function performServerReset(confirm: string): Promise<ServerResetReport> {
  if (confirm !== 'RESET') {
    throw new ApiError('VALIDATION_ERROR', 'Confirmação ausente — digite RESET para confirmar o reset geral.');
  }

  // 1) BACKUP primeiro — falha aqui aborta TUDO (nada é apagado)
  const backup = await backupDatabase();

  // 2) contagens pré-wipe (relatório/auditoria)
  const wiped = await countAll();

  // 3) WIPE numa única transação + marcador anti-ressurreição
  const resetAt = new Date();
  await db.$transaction(
    async (tx) => {
      // referências ativas primeiro (FKs)
      await tx.account.updateMany({ data: { activePlayerId: null } });
      await tx.session.deleteMany({});
      await tx.guildDonation.deleteMany({});
      await tx.activity.deleteMany({});
      await tx.questProgress.deleteMany({});
      await tx.achievementState.deleteMany({});
      await tx.requestDedup.deleteMany({});
      await tx.worldBossDamage.deleteMany({});
      await tx.seasonRankEntry.deleteMany({});
      await tx.walletTransaction.deleteMany({});
      await tx.purchase.deleteMany({});
      await tx.cosmeticOwned.deleteMany({});
      await tx.analyticsEvent.deleteMany({});
      await tx.worldBoss.deleteMany({});
      await tx.season.deleteMany({});
      await tx.player.deleteMany({});
      await tx.guild.deleteMany({});
      await tx.account.deleteMany({});

      // marcador: seeds antigos (pré-reset) jamais repopulam este banco
      await tx.gameMeta.upsert({
        where: { key: 'serverResetAt' },
        update: { value: resetAt.toISOString(), updatedAt: resetAt },
        create: { key: 'serverResetAt', value: resetAt.toISOString() },
      });
      await tx.gameMeta.upsert({
        where: { key: 'serverResetBackup' },
        update: { value: backup.path, updatedAt: resetAt },
        create: { key: 'serverResetBackup', value: backup.path },
      });

      // temporada limpa (numeração recomeça em 1)
      await ensureActiveSeason(tx);

      // evento de auditoria do próprio reset (o único analytics pós-wipe)
      await tx.analyticsEvent.create({
        data: {
          name: 'server_reset',
          metadata: JSON.stringify({ resetAt: resetAt.toISOString(), backup: backup.path, wiped }),
        },
      });
    },
    { timeout: 30_000, maxWait: 5_000 }
  );

  // 4) bots de PvP voltam (seed idempotente — mesmo gerador do /api/game/state)
  await ensureSeed();

  // 5) avatares órfãos (relata falhas, não aborta)
  const avatars = await cleanAvatarFiles();

  return {
    ok: true,
    backupPath: backup.path,
    backupBytes: backup.bytes,
    wiped,
    botsReseeded: await db.player.count({ where: { isBot: true } }),
    seasonName: (await db.season.findFirst({ where: { status: 'active' } }))?.name ?? 'Temporada 1',
    avatarsDeleted: avatars.deleted,
    avatarFailures: avatars.failed,
    resetAt: resetAt.toISOString(),
  };
}
