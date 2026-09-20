'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RACES, BATTLE_ENERGY_COST } from '@/lib/game/constants';
import { getPowerScale } from '@/lib/game/powerScale';
import type {
  GuildRankingPage,
  GuildRankingSort,
  PlayerView,
  RankingPage,
  RankingSort,
  RaceId,
} from '@/lib/game/types';
import { Chip, GameButton } from './Bits';
import { fetchPanelJson, LoadFail, RankingSkeleton } from './PanelLoad';
import {
  Crosshair,
  Crown,
  ChevronLeft,
  ChevronRight,
  Swords,
  Trophy,
  Zap,
  Users,
  Shield,
  Star,
} from 'lucide-react';

const PAGE_SIZE = 20;
const REFRESH_MS = 60_000;

type Scope = 'players' | 'guilds';
type PlayerRankingData = RankingPage;
type GuildRankingData = GuildRankingPage;

const PLAYER_SORTS: Array<{ id: RankingSort; label: string; icon: typeof Crown }> = [
  { id: 'power', label: 'Poder', icon: Zap },
  { id: 'level', label: 'Nível', icon: Star },
  { id: 'wins', label: 'Vitórias', icon: Swords },
  { id: 'tournament', label: 'Torneio', icon: Trophy },
  { id: 'worldboss', label: 'Ameaça', icon: Shield },
];

const GUILD_SORTS: Array<{ id: GuildRankingSort; label: string }> = [
  { id: 'power', label: 'Poder total' },
  { id: 'level', label: 'Nível da guilda' },
];

export function RankingPanel({
  player,
  onAttack,
  busy,
}: {
  player: PlayerView;
  onAttack: (targetId: string) => void;
  busy: boolean;
}) {
  const [scope, setScope] = useState<Scope>('players');
  const [playerSort, setPlayerSort] = useState<RankingSort>('power');
  const [guildSort, setGuildSort] = useState<GuildRankingSort>('power');
  const [race, setRace] = useState<RaceId | 'all'>('all');
  const [page, setPage] = useState(1);
  const [playerData, setPlayerData] = useState<PlayerRankingData | null>(null);
  const [guildData, setGuildData] = useState<GuildRankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const stateRef = useRef({ scope, playerSort, guildSort, race, page });
  stateRef.current = { scope, playerSort, guildSort, race, page };

  const load = useCallback(async (
    nextPage: number,
    silent = false,
    opts?: Partial<{ scope: Scope; playerSort: RankingSort; guildSort: GuildRankingSort; race: RaceId | 'all' }>
  ) => {
    const selectedScope = opts?.scope ?? stateRef.current.scope;
    const selectedPlayerSort = opts?.playerSort ?? stateRef.current.playerSort;
    const selectedGuildSort = opts?.guildSort ?? stateRef.current.guildSort;
    const selectedRace = opts?.race ?? stateRef.current.race;
    if (!silent) setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({
        playerId: player.id,
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
        scope: selectedScope,
        sort: selectedScope === 'guilds' ? selectedGuildSort : selectedPlayerSort,
      });
      if (selectedScope === 'players') params.set('race', selectedRace);
      const res = await fetchPanelJson(`/api/game/ranking?${params.toString()}`);
      if (!res.ok) {
        if (!silent) setFailed(true);
        return;
      }
      const json = await res.json();
      if (selectedScope === 'guilds') setGuildData(json.ranking);
      else setPlayerData(json.ranking);
      setUpdatedAt(new Date());
    } catch (err) {
      console.error('[ranking] FALHA ao buscar —', err);
      if (!silent) setFailed(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [player.id]);

  useEffect(() => {
    void load(page);
  }, [load, page, scope, playerSort, guildSort, race]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(stateRef.current.page, true), REFRESH_MS);
    const onFocus = () => void load(stateRef.current.page, true);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const resetAnd = (fn: () => void) => {
    setPage(1);
    fn();
  };

  const data = scope === 'players' ? playerData : guildData;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const noEnergy = player.energy < BATTLE_ENERGY_COST;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl sm:text-2xl text-amber-100 flex items-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400" /> Rankings
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {scope === 'players' && playerData && (
            <Chip className="bg-orange-950/50 text-orange-300 border-orange-800/50">
              Sua posição: {playerData.myPosition ?? '—'}º de {playerData.total}
            </Chip>
          )}
          {updatedAt && (
            <Chip className="bg-amber-950/50 text-amber-300/80 border-amber-800/50">
              Atualizado • {updatedAt.toLocaleTimeString('pt-BR')}
            </Chip>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-amber-900/40 bg-black/20 p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => resetAnd(() => setScope('players'))}
            className={`rounded-lg border px-3 py-2 text-sm font-heading transition-colors ${
              scope === 'players'
                ? 'border-orange-500/70 bg-orange-950/40 text-orange-200'
                : 'border-amber-900/40 text-amber-200/55 hover:text-amber-100'
            }`}
          >
            <Users className="inline w-4 h-4 mr-1.5" /> Guerreiros
          </button>
          <button
            type="button"
            onClick={() => resetAnd(() => setScope('guilds'))}
            className={`rounded-lg border px-3 py-2 text-sm font-heading transition-colors ${
              scope === 'guilds'
                ? 'border-emerald-500/70 bg-emerald-950/30 text-emerald-200'
                : 'border-amber-900/40 text-amber-200/55 hover:text-amber-100'
            }`}
          >
            <Shield className="inline w-4 h-4 mr-1.5" /> Guildas
          </button>
        </div>

        {scope === 'players' ? (
          <>
            <div className="flex flex-wrap gap-2">
              {PLAYER_SORTS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => resetAnd(() => setPlayerSort(id))}
                  className={`rounded-full border px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                    playerSort === id
                      ? 'border-orange-500/70 bg-orange-950/40 text-orange-200'
                      : 'border-amber-900/40 text-amber-200/55 hover:text-amber-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="ranking-race" className="text-xs text-amber-200/55">Raça</label>
              <select
                id="ranking-race"
                value={race}
                onChange={(e) => resetAnd(() => setRace(e.target.value as RaceId | 'all'))}
                className="rounded-lg border border-amber-900/50 bg-[#17100a] px-3 py-2 text-xs text-amber-100 outline-none focus:border-orange-600"
              >
                <option value="all">Todas as raças</option>
                {(Object.keys(RACES) as RaceId[]).map((id) => (
                  <option key={id} value={id}>{RACES[id].name}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {GUILD_SORTS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => resetAnd(() => setGuildSort(id))}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  guildSort === id
                    ? 'border-emerald-500/70 bg-emerald-950/30 text-emerald-200'
                    : 'border-amber-900/40 text-amber-200/55 hover:text-amber-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {failed && !data ? (
        <LoadFail what="O ranking" onRetry={() => void load(page)} />
      ) : loading && !data ? (
        <RankingSkeleton />
      ) : scope === 'players' && playerData ? (
        <PlayerRankingTable
          data={playerData}
          playerSort={playerSort}
          player={player}
          onAttack={onAttack}
          busy={busy}
          noEnergy={noEnergy}
        />
      ) : scope === 'guilds' && guildData ? (
        <GuildRankingTable data={guildData} />
      ) : null}

      {data && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <GameButton size="sm" variant="ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="w-4 h-4" /> Anterior
          </GameButton>
          <span className="text-xs font-heading text-amber-200/60">Página {page} de {totalPages}</span>
          <GameButton size="sm" variant="ghost" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            Próxima <ChevronRight className="w-4 h-4" />
          </GameButton>
        </div>
      )}
    </div>
  );
}

function metricLabel(sort: RankingSort): string {
  if (sort === 'level') return 'Nível';
  if (sort === 'wins') return 'Vitórias';
  if (sort === 'tournament') return 'Torneio';
  if (sort === 'worldboss') return 'Dano Ameaça';
  return 'Poder';
}

function metricValue(entry: RankingPage['entries'][number], sort: RankingSort): string {
  if (sort === 'level') return entry.level.toLocaleString('pt-BR');
  if (sort === 'wins') return entry.battlesWon.toLocaleString('pt-BR');
  if (sort === 'tournament') {
    return `${entry.tournamentWins.toLocaleString('pt-BR')}V • ${entry.tournamentTitles.toLocaleString('pt-BR')} títulos`;
  }
  if (sort === 'worldboss') return entry.worldBossDamage.toLocaleString('pt-BR');
  return entry.power.toLocaleString('pt-BR');
}

function PlayerRankingTable({
  data,
  playerSort,
  player,
  onAttack,
  busy,
  noEnergy,
}: {
  data: RankingPage;
  playerSort: RankingSort;
  player: PlayerView;
  onAttack: (targetId: string) => void;
  busy: boolean;
  noEnergy: boolean;
}) {
  return (
    <>
      <div className="hidden md:block rounded-xl border border-amber-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-amber-950/60 text-amber-200/80 font-heading text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">#</th>
              <th className="px-3 py-2.5 text-left">Guerreiro</th>
              <th className="px-3 py-2.5 text-left">Raça</th>
              <th className="px-3 py-2.5 text-right">{metricLabel(playerSort)}</th>
              <th className="px-3 py-2.5 text-right">Poder</th>
              <th className="px-3 py-2.5 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry, i) => (
              <tr key={entry.id} className={`border-t border-amber-900/20 ${entry.isMe ? 'bg-orange-950/40' : i % 2 === 0 ? 'bg-[#1a140d]/60' : 'bg-[#161009]/60'}`}>
                <td className="px-3 py-2.5 text-amber-200/50 font-heading">{entry.position === 1 ? '👑' : `${entry.position}º`}</td>
                <td className="px-3 py-2.5">
                  <span className={entry.isMe ? 'text-orange-300 font-heading' : 'text-amber-100'}>{entry.name}</span>
                  {entry.guildName && <Chip className="ml-1.5 bg-emerald-950/60 text-emerald-300 border-emerald-800/50">🛡 {entry.guildName}</Chip>}
                  {entry.dragonBallStars && entry.dragonBallStars.length > 0 && (
                    <Chip className="ml-1.5 bg-orange-950/60 text-orange-300 border-orange-800/50">
                      🔮 {entry.dragonBallStars.map((star) => `${star}★`).join(' ')}
                    </Chip>
                  )}
                </td>
                <td className="px-3 py-2.5 text-amber-200/60 text-xs">{RACE_EMOJI[entry.race]} {RACES[entry.race]?.name ?? entry.race}</td>
                <td className="px-3 py-2.5 text-right font-heading text-yellow-300">{metricValue(entry, playerSort)}</td>
                <td className="px-3 py-2.5 text-right font-heading text-orange-400">
                  {entry.power.toLocaleString('pt-BR')}
                  <span className={`ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-heading align-middle ${getPowerScale(entry.power).scale.badge}`}>
                    {getPowerScale(entry.power).scale.emoji} E{getPowerScale(entry.power).scale.index}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {!entry.isMe && entry.attackable && (
                    <GameButton
                      size="sm"
                      variant="danger"
                      onClick={() => onAttack(entry.id)}
                      disabled={busy || noEnergy}
                      title={noEnergy ? `Energia necessária: ${BATTLE_ENERGY_COST}` : `Atacar ${entry.name}`}
                    >
                      <Crosshair className="w-3.5 h-3.5" /> {noEnergy ? 'Sem energia' : 'Atacar'}
                    </GameButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {data.entries.map((entry) => (
          <div key={entry.id} className={`rounded-xl border p-3 flex items-center gap-3 ${entry.isMe ? 'bg-orange-950/40 border-orange-700/60' : 'bg-[#1a140d]/70 border-amber-900/30'}`}>
            <span className="font-heading text-amber-200/50 w-8 text-center">{entry.position === 1 ? '👑' : `${entry.position}º`}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${entry.isMe ? 'text-orange-300 font-heading' : 'text-amber-100'}`}>{entry.name}</p>
              <p className="text-[11px] text-amber-200/50">
                {RACE_EMOJI[entry.race]} Nv {entry.level} • ⚡ {entry.power.toLocaleString('pt-BR')}
              </p>
              <p className="text-[10px] text-yellow-300/80 mt-0.5">{metricLabel(playerSort)}: {metricValue(entry, playerSort)}</p>
            </div>
            {!entry.isMe && entry.attackable && (
              <GameButton size="sm" variant="danger" onClick={() => onAttack(entry.id)} disabled={busy || noEnergy} aria-label={`Atacar ${entry.name}`}>
                <Crosshair className="w-3.5 h-3.5" />
              </GameButton>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function GuildRankingTable({ data }: { data: GuildRankingPage }) {
  return (
    <>
      <div className="hidden md:block rounded-xl border border-amber-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-emerald-950/45 text-emerald-200/80 font-heading text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">#</th>
              <th className="px-3 py-2.5 text-left">Guilda</th>
              <th className="px-3 py-2.5 text-right">Nível</th>
              <th className="px-3 py-2.5 text-right">Poder total</th>
              <th className="px-3 py-2.5 text-right">Membros</th>
              <th className="px-3 py-2.5 text-left">Líder</th>
              <th className="px-3 py-2.5 text-right">Doações</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry, i) => (
              <tr key={entry.id} className={`border-t border-emerald-900/20 ${i % 2 === 0 ? 'bg-[#111a12]/60' : 'bg-[#101610]/60'}`}>
                <td className="px-3 py-2.5 text-emerald-200/50 font-heading">{entry.position === 1 ? '🏆' : `${entry.position}º`}</td>
                <td className="px-3 py-2.5 font-heading text-emerald-100">{entry.name}</td>
                <td className="px-3 py-2.5 text-right text-amber-300">{entry.level}</td>
                <td className="px-3 py-2.5 text-right font-heading text-orange-300">{entry.totalPower.toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2.5 text-right text-amber-200/70">{entry.memberCount}</td>
                <td className="px-3 py-2.5 text-amber-200/70">{entry.leaderName}</td>
                <td className="px-3 py-2.5 text-right text-yellow-300">{entry.totalDonated.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-2">
        {data.entries.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-emerald-900/35 bg-emerald-950/10 p-3">
            <div className="flex items-center gap-2">
              <span className="font-heading text-emerald-300">{entry.position === 1 ? '🏆' : `${entry.position}º`}</span>
              <p className="font-heading text-emerald-100 flex-1 truncate">{entry.name}</p>
              <Chip className="bg-emerald-950/50 text-emerald-300 border-emerald-800/50">Nv {entry.level}</Chip>
            </div>
            <p className="mt-1 text-xs text-amber-200/55">
              ⚡ {entry.totalPower.toLocaleString('pt-BR')} poder • 👥 {entry.memberCount} membros • Líder: {entry.leaderName}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

const RACE_EMOJI: Record<string, string> = {
  saiyajin: '🔥',
  humano: '🥋',
  namekuseijin: '🐲',
  androide: '⚡',
  majin: '🍬',
};
