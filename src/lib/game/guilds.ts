import type { Player, Prisma } from '@prisma/client';
import { ApiError } from '../api';
import { spendCurrency } from '../economy';
import { applyRegen } from './engine';
import { GUILD_PERMISSIONS, guildCapacity, guildLevel, guildThreshold, type GuildPermission } from './guildRules';
type Tx = Prisma.TransactionClient;
const invalid = (message: string): never => { throw new ApiError('VALIDATION_ERROR', message); };
const denied = (): never => { throw new ApiError('FORBIDDEN', 'Seu cargo não permite esta ação ou o alvo tem hierarquia igual/superior.'); };
export const isGuildAction = (type: string) => ['create_guild', 'join_guild', 'leave_guild', 'donate_guild'].includes(type) || type.startsWith('guild_');
export async function runGuildOnce(tx: Tx, actor: Player, type: string, args: Record<string, unknown>) {
  const requestId = String(args.requestId ?? '');
  if (requestId.length < 8 || requestId.length > 64) throw new ApiError('VALIDATION_ERROR', 'Identificador de ação obrigatório.');
  const previous = await tx.guildActionReceipt.findUnique({ where: { playerId_requestId: { playerId: actor.id, requestId } } });
  if (previous) return JSON.parse(previous.result) as { message: string; levelsGained: number };
  const result = await manageGuild(tx, actor, type, args);
  await tx.guildActionReceipt.create({ data: { playerId: actor.id, requestId, result: JSON.stringify(result) } });
  return result;
}
function clean(value: unknown, limit: number) {
  if (typeof value !== 'string' || value.length > limit) return invalid(`Texto inválido (máximo ${limit} caracteres).`);
  return value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}
export async function guildAuthority(tx: Tx, player: Pick<Player, 'id' | 'guildId'>) {
  const guild = player.guildId ? await tx.guild.findUnique({ where: { id: player.guildId } }) : null;
  if (!guild || guild.disbandedAt) throw new ApiError('NOT_FOUND', 'Guilda não encontrada.');
  const leader = guild.leaderId === player.id;
  const assigned = await tx.guildRoleAssignment.findUnique({ where: { playerId: player.id }, include: { role: true } });
  const role = assigned?.role.guildId === guild.id ? assigned.role : null;
  return { guild, leader, rank: leader ? 100 : role?.rank ?? 0,
    permissions: leader ? [...GUILD_PERMISSIONS] : JSON.parse(role?.permissions ?? '[]') as GuildPermission[], role };
}
// Liquida regeneração na taxa anterior antes de mudar vínculo/nível; não
// permite ganho retroativo de bônus após entrar e não perde regen ao sair.
async function settle(tx: Tx, id: string) {
  const player = await tx.player.findUniqueOrThrow({ where: { id }, include: { guild: true } });
  applyRegen(player);
  await tx.player.update({ where: { id }, data: { hp: player.hp, energy: player.energy,
    lastRegen: new Date(), lastRegenHp: new Date(), stateVersion: { increment: 1 } } });
}
async function detach(tx: Tx, id: string) {
  await settle(tx, id);
  await tx.guildRoleAssignment.deleteMany({ where: { playerId: id } });
  await tx.player.update({ where: { id }, data: { guildId: null } });
}
export async function manageGuild(tx: Tx, actor: Player, type: string, args: Record<string, unknown>) {
  const done = (message: string) => ({ message, levelsGained: 0 });
  if (type === 'create_guild') {
    if (actor.guildId) return invalid('Você já pertence a uma guilda.');
    const name = clean(args.guildName, 24);
    if (!/^[\p{L}\p{N} _-]{3,24}$/u.test(name)) return invalid('Nome inválido: use de 3 a 24 letras, números, espaços, hífen ou underline.');
    if (await tx.guild.findFirst({ where: { name } })) throw new ApiError('GUILD_NAME_TAKEN');
    await spendCurrency(tx, actor.id, 'zeni', 5000, { type: 'spend', source: 'guild_create', accountId: actor.accountId });
    const guild = await tx.guild.create({ data: { name, leaderId: actor.id } });
    await settle(tx, actor.id);
    const attached = await tx.player.updateMany({
      where: { id: actor.id, guildId: null },
      data: { guildId: guild.id },
    });
    if (!attached.count) throw new ApiError('CONFLICT', 'Seu vínculo de guilda mudou durante a fundação. Tente novamente.');
    return done(`Guilda ${name} fundada!`);
  }
  if (type === 'join_guild') return invalid('Para entrar, aceite um convite da guilda.');
  if (type === 'guild_accept' || type === 'guild_decline') {
    const invite = await tx.guildInvitation.findUnique({ where: { id: String(args.inviteId ?? '') } });
    if (!invite || invite.playerId !== actor.id) return denied();
    if (type === 'guild_decline') {
      await tx.guildInvitation.delete({ where: { id: invite.id } });
      return done('Convite recusado.');
    }
    if (invite.expiresAt <= new Date()) return invalid('Este convite expirou.');
    if (actor.guildId) return invalid('Você já pertence a uma guilda.');
    const guild = await tx.guild.findUniqueOrThrow({ where: { id: invite.guildId } });
    if (guild.disbandedAt) return invalid('Esta guilda foi dissolvida.');
    const locked = await tx.guild.updateMany({ where: { id: guild.id, stateVersion: guild.stateVersion }, data: { stateVersion: { increment: 1 } } });
    if (!locked.count) throw new ApiError('CONFLICT');
    if (await tx.player.count({ where: { guildId: guild.id } }) >= guildCapacity(guild.level)) return invalid('A guilda está sem vagas.');
    await settle(tx, actor.id);
    const attached = await tx.player.updateMany({
      where: { id: actor.id, guildId: null },
      data: { guildId: guild.id },
    });
    if (!attached.count) return invalid('Você já pertence a uma guilda.');
    await tx.guildRoleAssignment.deleteMany({ where: { playerId: actor.id } });
    await tx.guildInvitation.deleteMany({ where: { playerId: actor.id } });
    return done(`Bem-vindo à guilda ${guild.name}!`);
  }
  const auth = await guildAuthority(tx, actor);
  const { guild } = auth;
  const lock = await tx.guild.updateMany({ where: { id: guild.id, stateVersion: guild.stateVersion }, data: { stateVersion: { increment: 1 } } });
  if (!lock.count) throw new ApiError('CONFLICT');
  const permit = (permission: GuildPermission) => { if (!auth.permissions.includes(permission)) denied(); };
  if (type === 'donate_guild') {
    if (guild.level >= 10) return invalid('A guilda já atingiu o nível máximo. Doações encerradas.');
    const amount = args.amount;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) return invalid('Informe um valor inteiro maior que zero.');
    if (amount > guildThreshold(10) - guild.xp) return invalid(`Faltam apenas ${guildThreshold(10) - guild.xp} Zeni para o nível máximo.`);
    const level = Math.max(guild.level, guildLevel(guild.xp + amount));
    if (level > guild.level) for (const member of await tx.player.findMany({ where: { guildId: guild.id }, select: { id: true } })) await settle(tx, member.id);
    await spendCurrency(tx, actor.id, 'zeni', amount, { type: 'spend', source: 'guild_donation', accountId: actor.accountId, metadata: { guildId: guild.id } });
    await tx.guild.update({ where: { id: guild.id }, data: { xp: { increment: amount }, totalDonated: { increment: amount }, level } });
    await tx.player.update({ where: { id: actor.id }, data: { guildDonated: { increment: amount }, stateVersion: { increment: 1 } } });
    await tx.guildDonation.create({ data: { guildId: guild.id, playerId: actor.id, amount } });
    return done(`Doação de ${amount} Zeni registrada.${level > guild.level ? ` Guilda no nível ${level}!` : ''}`);
  }
  if (type === 'guild_description' || type === 'guild_motd') {
    permit(type === 'guild_description' ? 'alterar_descricao' : 'mensagem_do_dia');
    const text = clean(args.text, type === 'guild_description' ? 500 : 280);
    await tx.guild.update({ where: { id: guild.id }, data: type === 'guild_description' ? { description: text } : { motd: text } });
    return done('Mensagem atualizada.');
  }
  if (['guild_role_save', 'guild_role_delete'].includes(type)) {
    if (!auth.leader) return denied();
    const roleId = String(args.roleId ?? '');
    const existing = roleId ? await tx.guildRole.findUnique({ where: { id: roleId } }) : null;
    if (roleId && existing?.guildId !== guild.id) return denied();
    if (type === 'guild_role_delete') {
      if (!existing) return invalid('Cargo não encontrado.');
      await tx.guildRole.delete({ where: { id: roleId } });
    } else {
      const name = clean(args.roleName, 30);
      const rank = Number(args.rank);
      const permissions = args.permissions;
      if (!name || ['líder', 'lider', 'membro'].includes(name.toLowerCase()) || !Number.isInteger(rank) || rank < 1 || rank > 99) return invalid('Nome de cargo ou hierarquia inválida (1 a 99).');
      if (!Array.isArray(permissions) || permissions.some(p => !GUILD_PERMISSIONS.includes(p))) return invalid('Permissões inválidas.');
      const roles = await tx.guildRole.findMany({ where: { guildId: guild.id } });
      if (roles.some(r => r.id !== roleId && r.name.toLowerCase() === name.toLowerCase())) return invalid('Já existe um cargo com este nome.');
      if (!existing && roles.length >= 5) return invalid('Máximo de cinco cargos personalizados.');
      const data = { name, rank, permissions: JSON.stringify([...new Set(permissions)]) };
      if (existing) await tx.guildRole.update({ where: { id: roleId }, data });
      else await tx.guildRole.create({ data: { ...data, guildId: guild.id } });
    }
    return done('Cargos atualizados.');
  }
  if (type === 'guild_invite') {
    permit('convidar');
    const target = await tx.player.findUnique({ where: args.targetId ? { id: String(args.targetId) } : { name: clean(args.targetName, 60) } });
    if (!target || target.isBot) return invalid('Guerreiro não encontrado neste servidor.');
    if (target.guildId) return invalid('Este guerreiro já pertence a uma guilda.');
    if (await tx.player.count({ where: { guildId: guild.id } }) >= guildCapacity(guild.level)) return invalid('A guilda está sem vagas.');
    const expiresAt = new Date(Date.now() + 48 * 3600000);
    await tx.guildInvitation.upsert({ where: { guildId_playerId: { guildId: guild.id, playerId: target.id } }, create: { guildId: guild.id, playerId: target.id, inviterId: actor.id, expiresAt }, update: { inviterId: actor.id, expiresAt } });
    return done(`Convite enviado a ${target.name}.`);
  }
  if (type === 'guild_revoke') {
    permit('convidar');
    await tx.guildInvitation.deleteMany({ where: { id: String(args.inviteId), guildId: guild.id } });
    return done('Convite revogado.');
  }
  if (type === 'guild_dissolve' || type === 'leave_guild') {
    const members = await tx.player.findMany({ where: { guildId: guild.id }, select: { id: true } });
    const dissolve = type === 'guild_dissolve' || members.length === 1;
    if (type === 'guild_dissolve' && !auth.leader) return denied();
    if (dissolve) {
      if (auth.leader && args.confirm !== true) return invalid('Confirme explicitamente a dissolução da guilda.');
      for (const member of members) await detach(tx, member.id);
      await tx.guildInvitation.deleteMany({ where: { guildId: guild.id } });
      await tx.guildRole.deleteMany({ where: { guildId: guild.id } });
      await tx.guild.update({ where: { id: guild.id }, data: { disbandedAt: new Date() } });
      return done('Guilda dissolvida.');
    }
    if (auth.leader) return invalid('Transfira a liderança antes de sair ou dissolva a guilda.');
    await detach(tx, actor.id);
    return done('Você saiu da guilda.');
  }
  if (['guild_kick', 'guild_assign', 'guild_transfer'].includes(type)) {
    if (type === 'guild_transfer') { if (!auth.leader) return denied(); }
    else permit(type === 'guild_kick' ? 'expulsar' : 'promover');
    const target = await tx.player.findUnique({ where: { id: String(args.targetId ?? '') } });
    if (!target || target.guildId !== guild.id || target.id === guild.leaderId) return denied();
    const targetAuth = await guildAuthority(tx, target);
    if (targetAuth.rank >= auth.rank) return denied();
    if (type === 'guild_kick') await detach(tx, target.id);
    if (type === 'guild_transfer') {
      await tx.guildRoleAssignment.deleteMany({ where: { playerId: { in: [actor.id, target.id] } } });
      await tx.guild.update({ where: { id: guild.id }, data: { leaderId: target.id } });
      if (args.leave === true) await detach(tx, actor.id);
    }
    if (type === 'guild_assign') {
      const role = args.roleId ? await tx.guildRole.findUnique({ where: { id: String(args.roleId) } }) : null;
      if (args.roleId && (!role || role.guildId !== guild.id || role.rank >= auth.rank)) return denied();
      await tx.guildRoleAssignment.deleteMany({ where: { playerId: target.id } });
      if (role) await tx.guildRoleAssignment.create({ data: { playerId: target.id, roleId: role.id } });
    }
    return done('Membros atualizados.');
  }
  return invalid('Ação de guilda desconhecida.');
}
