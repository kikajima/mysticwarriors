'use client';

import { useCallback, useEffect, useState } from 'react';
import { GUILD_CREATION_COST } from '@/lib/game/constants';
import type { GuildDetail, GuildSummary, PlayerView } from '@/lib/game/types';
import { Chip, GameButton, GameCard, RaceAvatar, SectionTitle } from './Bits';
import { fetchPanelJson, GuildsSkeleton, LoadFail } from './PanelLoad';
import { Coins, Crown, LogOut, Shield, Swords, Users, Flag, Loader2, HandCoins, TrendingUp } from 'lucide-react';

export function GuildsPanel({
  player,
  onAction,
  busy,
}: {
  player: PlayerView;
  onAction: (payload: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
}) {

  // v0.16 — matriz de ocupação: gestão de guilda LIBERADA durante o
  // trabalho (doar, fundar, entrar, sair — só treino/PvE/torneio negados).
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [myGuild, setMyGuild] = useState<GuildDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // v0.9.24 (B1): falha inicial → estado amigável + retry (timeout 8s)
  const [failed, setFailed] = useState(false);
  const [guildName, setGuildName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [donation, setDonation] = useState('100');

  const refresh = useCallback(async () => {
    try {
      const res = await fetchPanelJson(`/api/game/guilds?playerId=${player.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setGuilds(data.guilds ?? []);
      setMyGuild(data.myGuild ?? null);
      setFailed(false);
    } catch {
      // v0.9.24 (B1): só vira estado de ERRO quando ainda não há nada na
      // tela (refresh pós-ação continua silencioso — o dado antigo vale)
      if (guilds.length === 0 && !myGuild) setFailed(true);
    } finally {
      setLoading(false);
    }
     
  }, [player.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (payload: Record<string, unknown>) => {
    const ok = await onAction(payload);
    if (ok) {
      await refresh();
      if (payload.type === 'create_guild') {
        setShowCreate(false);
        setGuildName('');
        setFormError(null);
      }
    }
    return ok;
  };

  const submitCreate = async () => {
    setFormError(null);
    const name = guildName.trim();
    if (name.length < 3) {
      setFormError('O nome da guilda precisa ter pelo menos 3 caracteres.');
      return;
    }
    await run({ type: 'create_guild', guildName: name });
  };

  const submitDonation = async () => {
    const amount = Math.floor(Number(donation));
    if (!Number.isFinite(amount) || amount < 100) return;
    await run({ type: 'donate_guild', amount });
  };

  const inGuild = !!myGuild;

  return (
    <div className="space-y-6">
      <SectionTitle icon="🛡️">Guildas de Guerreiros</SectionTitle>

      {failed && !inGuild && guilds.length === 0 ? (
        <LoadFail what="As guildas" onRetry={() => void refresh()} />
      ) : loading ? (
        <GuildsSkeleton />
      ) : inGuild && myGuild ? (
        /* ===== Minha guilda ===== */
        <GameCard className="p-5" glow>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-3xl border border-emerald-500/40 shadow-lg shadow-emerald-900/40">
                🛡️
              </div>
              <div>
                <h3 className="font-heading text-xl text-amber-100 leading-tight flex items-center gap-2">
                  {myGuild.name}
                  <Chip className="bg-emerald-950/60 text-emerald-300 border-emerald-800/50">
                    Nível {myGuild.level}
                  </Chip>
                </h3>
                <p className="text-xs text-amber-200/50">
                  <Users className="w-3 h-3 inline mr-1" />
                  {myGuild.members.length} {myGuild.members.length === 1 ? 'membro' : 'membros'} • Fundada por{' '}
                  {myGuild.members.find((m) => m.id === myGuild.leaderId)?.name ?? '—'}
                </p>
              </div>
            </div>
            <GameButton variant="danger" size="sm" onClick={() => run({ type: 'leave_guild' })} disabled={busy}>
              <LogOut className="w-4 h-4" /> {player.guild?.isLeader ? 'Sair (passa a liderança)' : 'Sair da guilda'}
            </GameButton>
          </div>

          {/* Progresso da guilda */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="bg-black/30 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-amber-200/40 uppercase">Nível</p>
              <p className="font-heading text-lg text-emerald-400">{myGuild.level}</p>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-amber-200/40 uppercase">XP da guilda</p>
              <p className="font-heading text-sm text-amber-200 mt-1">
                {myGuild.xp.toLocaleString('pt-BR')}
                <span className="text-amber-200/40 text-[10px]"> / {myGuild.xpToNext.toLocaleString('pt-BR')}</span>
              </p>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-amber-200/40 uppercase">Doado (total)</p>
              <p className="font-heading text-sm text-yellow-400 mt-1">{myGuild.totalDonated.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-black/30 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-amber-200/40 uppercase">Seu poder</p>
              <p className="font-heading text-sm text-orange-400 mt-1">{player.derived.power.toLocaleString('pt-BR')}</p>
            </div>
          </div>

          {/* Doação */}
          <div className="rounded-lg border border-amber-900/40 bg-black/20 p-3 mb-4">
            <p className="text-xs font-heading text-amber-100 mb-2 flex items-center gap-1.5">
              <HandCoins className="w-4 h-4 text-yellow-400" /> Contribuir com a guilda
            </p>
            <p className="text-[11px] text-amber-200/40 mb-2">
              Doações viram XP da guilda e sobem o nível dela (doações também contam para conquistas).
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                min={100}
                step={100}
                value={donation}
                onChange={(e) => setDonation(e.target.value)}
                aria-label="Valor da doação em Zeni"
                className="flex-1 bg-black/40 border border-amber-800/50 rounded-lg px-3 py-2 text-sm text-amber-100 focus:outline-none focus:border-orange-500 font-heading"
              />
              <GameButton size="sm" variant="gold" onClick={submitDonation} disabled={busy || player.zeni < 100}>
                <Coins className="w-4 h-4" /> Doar Zeni
              </GameButton>
            </div>
          </div>

          {/* Membros */}
          <h4 className="font-heading text-amber-100 text-sm mb-2 flex items-center gap-1.5">
            <Swords className="w-4 h-4" /> Membros
          </h4>
          <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-thin pr-1">
            {myGuild.members.map((m, i) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  m.isMe ? 'bg-orange-950/40 border-orange-700/50' : 'bg-black/30 border-amber-900/30'
                }`}
              >
                <span className="font-heading text-amber-200/40 text-xs w-5 text-center">{i + 1}º</span>
                <RaceAvatar race={m.race} className="w-8 h-8" emojiSize="text-base" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-100 truncate flex items-center gap-1.5 flex-wrap">
                    {m.name}
                    {m.isLeader && (
                      <Chip className="bg-yellow-950/60 text-yellow-300 border-yellow-700/50">
                        <Crown className="w-3 h-3" /> líder
                      </Chip>
                    )}
                    {m.isMe && <Chip className="bg-orange-900/60 text-orange-200 border-orange-700/60">você</Chip>}
                  </p>
                  <p className="text-[11px] text-amber-200/50">Nível {m.level}</p>
                </div>
                <span className="font-heading text-orange-400 text-sm whitespace-nowrap">
                  ⚡ {m.power.toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </GameCard>
      ) : (
        /* ===== Sem guilda: criar ou entrar ===== */
        <>
          <GameCard className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-200/70 flex-1 min-w-60">
                Funda sua própria guilda ou junte-se a uma existente. Guildas reúnem guerreiros sob a mesma
                bandeira — doem, subam de nível e dominem o ranking!
              </p>
              {!showCreate && (
                <GameButton variant="gold" onClick={() => setShowCreate(true)} disabled={busy}>
                  <Flag className="w-4 h-4" /> Fundar guilda
                </GameButton>
              )}
            </div>

            {showCreate && (
              <div className="mt-4 border-t border-amber-900/30 pt-4 space-y-3 slide-in">
                <label htmlFor="guild-name" className="font-heading text-amber-100 text-sm block">
                  Nome da guilda
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="guild-name"
                    value={guildName}
                    onChange={(e) => setGuildName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
                    maxLength={24}
                    placeholder="Ex: Guerreiros Z, Patrulha do Lobo..."
                    className="flex-1 bg-black/40 border border-amber-800/50 rounded-lg px-4 py-2.5 text-amber-100 placeholder:text-amber-200/30 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-900/50 font-heading"
                  />
                  <GameButton
                    variant="gold"
                    onClick={submitCreate}
                    disabled={busy || player.zeni < GUILD_CREATION_COST}
                  >
                    <Coins className="w-4 h-4" /> {GUILD_CREATION_COST.toLocaleString('pt-BR')} Zeni
                  </GameButton>
                </div>
                {formError && (
                  <p role="alert" className="text-red-400 text-sm">
                    ⚠ {formError}
                  </p>
                )}
                {player.zeni < GUILD_CREATION_COST && (
                  <p className="text-xs text-red-300/80">
                    Você tem {player.zeni.toLocaleString('pt-BR')} Zeni — faltam{' '}
                    {(GUILD_CREATION_COST - player.zeni).toLocaleString('pt-BR')} para fundar a guilda.
                  </p>
                )}
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setFormError(null);
                  }}
                  className="text-xs text-amber-200/50 hover:text-amber-100 transition-colors"
                >
                  cancelar
                </button>
              </div>
            )}
          </GameCard>

          {/* Lista de guildas */}
          <div>
            <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Guildas do universo ({guilds.length})
            </h3>
            {guilds.length === 0 ? (
              <GameCard className="p-6 text-center text-amber-200/50 text-sm">
                Nenhuma guilda fundada ainda. Seja o primeiro a hastear uma bandeira!
              </GameCard>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {guilds.map((g, i) => (
                  <GameCard key={g.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-heading text-amber-200/40 text-sm w-7">{i === 0 ? '👑' : `${i + 1}º`}</span>
                        <div className="min-w-0">
                          <h4 className="font-heading text-amber-100 truncate flex items-center gap-1.5 flex-wrap">
                            🛡️ {g.name}
                            <Chip className="bg-emerald-950/60 text-emerald-300 border-emerald-800/50 shrink-0">
                              Nv {g.level}
                            </Chip>
                          </h4>
                          <p className="text-[11px] text-amber-200/50">
                            Líder: {g.leaderName} • {g.memberCount} {g.memberCount === 1 ? 'membro' : 'membros'} •{' '}
                            <TrendingUp className="w-3 h-3 inline" /> {g.totalDonated.toLocaleString('pt-BR')} doados
                          </p>
                        </div>
                      </div>
                      <Chip className="bg-orange-950/50 text-orange-300 border-orange-800/50 shrink-0">
                        ⚡ {g.totalPower.toLocaleString('pt-BR')}
                      </Chip>
                    </div>
                    {g.description && (
                      <p className="text-xs text-amber-200/60 leading-relaxed mb-3">{g.description}</p>
                    )}
                    <GameButton
                      size="sm"
                      className="w-full"
                      onClick={() => run({ type: 'join_guild', targetId: g.id })}
                      disabled={busy}
                    >
                      <Users className="w-4 h-4" /> Entrar na guilda
                    </GameButton>
                  </GameCard>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
