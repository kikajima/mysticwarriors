'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuildDetail, GuildSummary, PlayerView } from '@/lib/game/types';
import { GUILD_BONUS_TABLE, GUILD_PERMISSIONS, guildThreshold } from '@/lib/game/guildRules';
import { GameButton, GameCard, SectionTitle } from './Bits';
import { fetchPanelJson, GuildsSkeleton, LoadFail } from './PanelLoad';
const input = 'w-full min-w-0 rounded border border-amber-800 bg-black/40 p-2 text-amber-100';
type Invite = { id: string; name: string; guildId: string; expiresAt: string };
export function GuildsPanel({ player, onAction, busy }: { player: PlayerView; onAction: (payload: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [myGuild, setMyGuild] = useState<GuildDetail | null>(null);
  const [publicGuild, setPublicGuild] = useState<GuildDetail | null>(null);
  const [invitations, setInvitations] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState('');
  const [donation, setDonation] = useState('100');
  const [target, setTarget] = useState('');
  const [description, setDescription] = useState('');
  const [motd, setMotd] = useState('');
  const [roleId, setRoleId] = useState('');
  const [roleName, setRoleName] = useState('');
  const [rank, setRank] = useState('1');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const submitting = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const res = await fetchPanelJson(`/api/game/guilds?playerId=${player.id}&page=${page}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGuilds(data.guilds); setMyGuild(data.myGuild); setInvitations(data.invitations); setTotal(data.total);
      setFailed(false);
    } catch { setFailed(true); } finally { setLoading(false); }
  }, [player.id, page]);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 15000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { setDescription(myGuild?.description ?? ''); setMotd(myGuild?.motd ?? ''); }, [myGuild?.description, myGuild?.motd]);
  const run = async (payload: Record<string, unknown>) => {
    if (submitting.current || busy) return;
    submitting.current = true;
    try { if (await onAction(payload)) await refresh(); } finally { submitting.current = false; }
  };
  const can = (permission: string) => myGuild?.permissions?.includes(permission);
  const leader = myGuild?.leaderId === player.id;
  const currentLevelFloor = myGuild ? guildThreshold(myGuild.level) : 0;
  const levelProgress = myGuild ? Math.max(0, myGuild.xp - currentLevelFloor) : 0;
  const levelCost = myGuild ? Math.max(1, myGuild.xpToNext - currentLevelFloor) : 1;
  const showPublic = async (id: string) => {
    try { const res = await fetchPanelJson(`/api/game/guilds?playerId=${player.id}&guildId=${id}`); if (!res.ok) throw new Error(); setPublicGuild((await res.json()).publicGuild); }
    catch { setFailed(true); }
  };
  const roster = (g: GuildDetail, manage: boolean) => <ul className="space-y-3">{g.members.map(m => <li key={m.id} className="rounded border border-amber-900/50 p-3 space-y-2">
    <p className="break-words font-bold">{m.name} · {m.roleName}</p>
    <p className="text-sm">Nv {m.level} · {m.online ? 'Online' : 'Offline'}{manage ? ` · Doou ${m.donated ?? 0} Zeni` : ''}</p>
    {manage && !m.isLeader && (m.rank ?? 0) < (g.myRank ?? 0) && <div className="flex flex-wrap gap-2">
      {can('promover') && <select aria-label={`Cargo de ${m.name}`} className={input} value={m.roleId ?? ''} disabled={busy} onChange={e => void run({ type: 'guild_assign', targetId: m.id, roleId: e.target.value || null })}>
        <option value="">Membro</option>{g.roles?.filter(r => r.rank < (g.myRank ?? 0)).map(r => <option value={r.id} key={r.id}>{r.name}</option>)}
      </select>}
      {can('expulsar') && <GameButton size="sm" variant="danger" disabled={busy} onClick={() => { if (window.confirm(`Expulsar ${m.name}?`)) void run({ type: 'guild_kick', targetId: m.id }); }}>Expulsar {m.name}</GameButton>}
      {leader && <GameButton size="sm" disabled={busy} onClick={() => { if (window.confirm(`Transferir a liderança para ${m.name}?`)) void run({ type: 'guild_transfer', targetId: m.id }); }}>Transferir liderança</GameButton>}
      {leader && <GameButton size="sm" disabled={busy} onClick={() => { if (window.confirm(`Transferir para ${m.name} e sair da guilda?`)) void run({ type: 'guild_transfer', targetId: m.id, leave: true }); }}>Transferir e sair</GameButton>}
    </div>}
  </li>)}</ul>;
  if (loading) return <GuildsSkeleton />;
  return <div className="space-y-5 text-amber-100">
    <SectionTitle icon="🛡️">Guildas de Guerreiros</SectionTitle>
    {failed && <LoadFail what="As guildas" onRetry={() => void refresh()} />}
    {invitations.length > 0 && <GameCard className="p-4 space-y-3"><h3>Convites recebidos</h3>{invitations.map(i => <div key={i.id} className="space-y-2"><button className="underline" onClick={() => void showPublic(i.guildId)}>{i.name}</button><p className="text-xs">Até {new Date(i.expiresAt).toLocaleString('pt-BR')}</p><div className="flex gap-2"><GameButton disabled={busy} onClick={() => void run({ type: 'guild_accept', inviteId: i.id })}>Aceitar</GameButton><GameButton disabled={busy} variant="danger" onClick={() => void run({ type: 'guild_decline', inviteId: i.id })}>Recusar</GameButton></div></div>)}</GameCard>}
    {myGuild ? <GameCard className="p-4 space-y-4">
      <h2 className="font-heading text-xl break-words">🛡️ {myGuild.name} · Nv {myGuild.level}</h2>
      <p className="whitespace-pre-wrap break-words">{myGuild.description}</p>
      {myGuild.motd && <p className="rounded bg-amber-950 p-3 whitespace-pre-wrap break-words">📣 {myGuild.motd}</p>}
      <p>{myGuild.members.length}/{myGuild.capacity} membros · Total doado: {myGuild.totalDonated.toLocaleString('pt-BR')} Zeni</p>
      <div className="rounded border border-amber-900/60 bg-black/20 p-3">
        <h3 className="font-heading">Bônus coletivos ativos</h3>
        {GUILD_BONUS_TABLE.filter(([level]) => level <= myGuild.level).length > 0
          ? <ul className="mt-2 space-y-1 text-sm">{GUILD_BONUS_TABLE.filter(([level]) => level <= myGuild.level).map(([level, label, value]) => <li key={level}>Nv {level}: {label} +{value}%</li>)}</ul>
          : <p className="mt-2 text-sm text-amber-200/80">O primeiro bônus é liberado no nível 2.</p>}
      </div>
      {myGuild.level < 10 ? <div className="space-y-2"><label htmlFor="guild-donation">Progresso para Nv {myGuild.level + 1}: {levelProgress.toLocaleString('pt-BR')} / {levelCost.toLocaleString('pt-BR')} Zeni</label><progress className="w-full" value={levelProgress} max={levelCost} /><input id="guild-donation" className={input} type="number" min="1" step="1" value={donation} onChange={e => setDonation(e.target.value)} /><GameButton disabled={busy} onClick={() => void run({ type: 'donate_guild', amount: Number(donation) })}>Doar Zeni</GameButton></div> : <p>Nível máximo alcançado</p>}
      {can('alterar_descricao') && <div className="space-y-2"><label htmlFor="guild-description">Descrição pública</label><textarea id="guild-description" className={input} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} /><GameButton disabled={busy} onClick={() => void run({ type: 'guild_description', text: description })}>Salvar descrição</GameButton></div>}
      {can('mensagem_do_dia') && <div className="space-y-2"><label htmlFor="guild-motd">Mensagem do dia</label><textarea id="guild-motd" className={input} maxLength={280} value={motd} onChange={e => setMotd(e.target.value)} /><GameButton disabled={busy} onClick={() => void run({ type: 'guild_motd', text: motd })}>Salvar mensagem</GameButton></div>}
      {can('convidar') && <div className="space-y-2"><label htmlFor="guild-target">Convidar guerreiro pelo nome</label><input id="guild-target" className={input} value={target} onChange={e => setTarget(e.target.value)} /><GameButton disabled={busy} onClick={() => void run({ type: 'guild_invite', targetName: target })}>Enviar convite</GameButton>{myGuild.invitations?.map(i => <div key={i.id} className="flex flex-wrap gap-2 items-center"><span>{i.name}</span><GameButton size="sm" disabled={busy} onClick={() => void run({ type: 'guild_revoke', inviteId: i.id })}>Revogar convite</GameButton></div>)}</div>}
      <h3 className="font-heading">Membros</h3>{roster(myGuild, true)}
      {leader && <fieldset className="border border-amber-900 p-3 space-y-3"><legend>Cargos personalizados</legend>
        <select className={input} aria-label="Editar cargo" value={roleId} onChange={e => { const r = myGuild.roles?.find(r => r.id === e.target.value); setRoleId(e.target.value); setRoleName(r?.name ?? ''); setRank(String(r?.rank ?? 1)); setPermissions(r?.permissions ?? []); }}><option value="">Novo cargo</option>{myGuild.roles?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <label className="block">Nome do cargo<input className={input} maxLength={30} value={roleName} onChange={e => setRoleName(e.target.value)} /></label>
        <label className="block">Hierarquia<input className={input} type="number" min="1" max="99" value={rank} onChange={e => setRank(e.target.value)} /></label>
        {GUILD_PERMISSIONS.map(p => <label key={p} className="flex gap-2"><input type="checkbox" checked={permissions.includes(p)} onChange={e => setPermissions(e.target.checked ? [...permissions, p] : permissions.filter(x => x !== p))} />{p.replaceAll('_', ' ')}</label>)}
        <GameButton disabled={busy} onClick={() => void run({ type: 'guild_role_save', roleId: roleId || null, roleName, rank: Number(rank), permissions })}>Salvar cargo</GameButton>
        {roleId && <GameButton disabled={busy} variant="danger" onClick={() => { if (window.confirm('Excluir este cargo?')) { void run({ type: 'guild_role_delete', roleId }); setRoleId(''); } }}>Excluir cargo</GameButton>}
      </fieldset>}
      <h3 className="font-heading">Maiores doadores</h3><ol>{myGuild.donors?.map(d => <li className="break-words" key={d.id}>{d.name}: {d.total.toLocaleString('pt-BR')} Zeni</li>)}</ol>
      <div className="flex flex-wrap gap-2">{!leader && <GameButton disabled={busy} variant="danger" onClick={() => { if (window.confirm('Sair da guilda?')) void run({ type: 'leave_guild' }); }}>Sair da guilda</GameButton>}{leader && <GameButton disabled={busy} variant="danger" onClick={() => { if (window.confirm(`Dissolver ${myGuild.name} e remover todos os membros?`)) void run({ type: 'guild_dissolve', confirm: true }); }}>Dissolver guilda</GameButton>}</div>
    </GameCard> : <GameCard className="p-4 space-y-3"><label htmlFor="guild-name">Nome da nova guilda</label><input id="guild-name" className={input} maxLength={24} value={name} onChange={e => setName(e.target.value)} /><GameButton disabled={busy || player.zeni < 5000} onClick={() => void run({ type: 'create_guild', guildName: name })}>Fundar por 5.000 Zeni</GameButton></GameCard>}
    {publicGuild && <GameCard className="p-4 space-y-3"><GameButton size="sm" onClick={() => setPublicGuild(null)}>Fechar perfil</GameButton><h3 className="font-heading text-xl">🛡️ {publicGuild.name} · Nv {publicGuild.level}</h3><p className="whitespace-pre-wrap break-words">{publicGuild.description}</p><p>Líder: {publicGuild.members.find(m => m.isLeader)?.name}</p>{roster(publicGuild, false)}</GameCard>}
    <h3 className="font-heading">Guildas do universo</h3>{guilds.map(g => <GameCard key={g.id} className="p-3"><button className="text-left w-full break-words" onClick={() => void showPublic(g.id)}><strong>{g.name}</strong> · Nv {g.level} · {g.memberCount} membros<p className="text-sm">{g.description}</p></button></GameCard>)}
    <div className="flex gap-2"><GameButton disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</GameButton><span>{page}</span><GameButton disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Próxima</GameButton></div>
  </div>;
}
