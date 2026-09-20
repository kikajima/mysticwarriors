'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RACES, BATTLE_ENERGY_COST } from '@/lib/game/constants';
import { getPowerScale } from '@/lib/game/powerScale';
import {
  GUILD_RANKING_CATEGORIES,
  PLAYER_RANKING_CATEGORIES,
  guildRankingMetric,
  playerRankingMetric,
} from '@/lib/game/ranking';
import type {
  GuildRankingCategory,
  PlayerRankingCategory,
  PlayerView,
  RaceId,
  RankingPage,
} from '@/lib/game/types';
import { Chip, GameButton, GameCard } from './Bits';
import { fetchPanelJson, LoadFail, RankingSkeleton } from './PanelLoad';
import { Crosshair, Crown, ChevronLeft, ChevronRight, Shield, Swords } from 'lucide-react';

const PAGE_SIZE = 20;
const REFRESH_MS = 60_000;

const RACE_EMOJI: Record<string, string> = {
  saiyajin: '🔥',
  humano: '🥋',
  namekuseijin: '🐲',
  androide: '⚡',
  majin: '🍬',
};

function formatMetric(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function RankingPanel({
  player,
  onAttack,
  busy,
}: {
  player: PlayerView;
  onAttack: (targetId: string) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<'players' | 'guilds'>('players');
  const [playerCategory, setPlayerCategory] = useState<PlayerRankingCategory>('power');
  const [guildCategory, setGuildCategory] = useState<GuildRankingCategory>('guild_power');
  const [race, setRace] = useState<RaceId | 'all'>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RankingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const category = mode === 'players' ? playerCategory : guildCategory;

  const load = useCallback(async (p: number, silent = false) => {
    if (!silent) setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({
        playerId: player.id,
        page: String(p),
        pageSize: String(PAGE_SIZE),
        mode,
        category,
        race: mode === 'players' ? race : 'all',
      });
      const res = await fetchPanelJson(`/api/game/ranking?${params.toString()}`);
      if (!res.ok) {
        if (!silent) setFailed(true);
        return;
      }
      const json = await res.json();
      setData(json.ranking);
      setUpdatedAt(new Date());
    } catch {
      if (!silent) setFailed(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [player.id, mode, category, race]);

  useEffect(() => {
    setPage(1);
    setData(null);
  }, [mode, category, race]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    const timer = setInterval(() => void load(pageRef.current, true), REFRESH_MS);
    const onFocus = () => void load(pageRef.current, true);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const noEnergy = player.energy < BATTLE_ENERGY_COST;
  const categoryDefs = mode === 'players' ? PLAYER_RANKING_CATEGORIES : GUILD_RANKING_CATEGORIES;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl sm:text-2xl text-amber-100 flex items-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400" /> Ranking
        </h2>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip className="bg-orange-950/50 text-orange-300 border-orange-800/50">
              Sua posição: {data.myPosition ?? '—'}º de {data.total}
            </Chip>
            <Chip className="bg-amber-950/50 text-amber-300/80 border-amber-800/50">
              Atualizado{updatedAt ? ` • ${updatedAt.toLocaleTimeString('pt-BR')}` : ''}
            </Chip>
          </div>
        )}
      </div>

      <GameCard className="p-4 space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('players')}
            className={`font-heading text-sm px-4 py-2 rounded-lg border ${mode === 'players' ? 'bg-orange-950/70 border-orange-500 text-orange-200' : 'bg-black/20 border-amber-900/40 text-amber-200/60'}`}
          >
            <Swords className="w-4 h-4 inline mr-1.5" /> Guerreiros
          </button>
          <button
            type="button"
            onClick={() => setMode('guilds')}
            className={`font-heading text-sm px-4 py-2 rounded-lg border ${mode === 'guilds' ? 'bg-emerald-950/70 border-emerald-600 text-emerald-200' : 'bg-black/20 border-amber-900/40 text-amber-200/60'}`}
          >
            <Shield className="w-4 h-4 inline mr-1.5" /> Guildas
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {categoryDefs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (mode === 'players') setPlayerCategory(item.id as PlayerRankingCategory);
                else setGuildCategory(item.id as GuildRankingCategory);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs transition-all ${category === item.id ? 'border-yellow-500/70 bg-yellow-950/40 text-yellow-200' : 'border-amber-900/40 bg-black/20 text-amber-200/55 hover:border-amber-700/60'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {mode === 'players' && (
          <div className="flex flex-wrap gap-1.5 border-t border-amber-900/30 pt-3">
            <button
              type="button"
              onClick={() => setRace('all')}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${race === 'all' ? 'border-orange-500/70 text-orange-200 bg-orange-950/40' : 'border-amber-900/30 text-amber-200/50'}`}
            >
              Todas as raças
            </button>
            {(Object.keys(RACES) as RaceId[]).map((raceId) => (
              <button
                key={raceId}
                type="button"
                onClick={() => setRace(raceId)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${race === raceId ? 'border-orange-500/70 text-orange-200 bg-orange-950/40' : 'border-amber-900/30 text-amber-200/50'}`}
              >
                {RACE_EMOJI[raceId]} {RACES[raceId].name}
              </button>
            ))}
          </div>
        )}
      </GameCard>

      {failed && !data ? (
        <LoadFail what="O ranking" onRetry={() => void load(page)} />
      ) : loading && !data ? (
        <RankingSkeleton />
      ) : mode === 'players' ? (
        <PlayerRankingTable
          data={data}
          category={playerCategory}
          busy={busy}
          noEnergy={noEnergy}
          onAttack={onAttack}
        />
      ) : (
        <GuildRankingTable data={data} category={guildCategory} />
      )}

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

function PlayerRankingTable({
  data,
  category,
  busy,
  noEnergy,
  onAttack,
}: {
  data: RankingPage | null;
  category: PlayerRankingCategory;
  busy: boolean;
  noEnergy: boolean;
  onAttack: (targetId: string) => void;
}) {
  const ranking = data?.entries ?? [];
  const metricLabel = PLAYER_RANKING_CATEGORIES.find((item) => item.id === category)?.shortLabel ?? 'Valor';
  return (
    <>
      <div className="hidden md:block rounded-xl border border-amber-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-amber-950/60 text-amber-200/80 font-heading text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">#</th>
              <th className="px-3 py-2.5 text-left">Guerreiro</th>
              <th className="px-3 py-2.5 text-left">Raça</th>
              <th className="px-3 py-2.5 text-right">{metricLabel}</th>
              <th className="px-3 py-2.5 text-right">Nível</th>
              <th className="px-3 py-2.5 text-right">Poder</th>
              <th className="px-3 py-2.5 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((entry, i) => (
              <tr key={entry.id} className={`border-t border-amber-900/20 ${entry.isMe ? 'bg-orange-950/40' : i % 2 === 0 ? 'bg-[#1a140d]/60' : 'bg-[#161009]/60'}`}>
                <td className="px-3 py-2.5 text-amber-200/50 font-heading">{entry.position === 1 ? '👑' : `${entry.position}º`}</td>
                <td className="px-3 py-2.5">
                  <span className={entry.isMe ? 'text-orange-300 font-heading' : 'text-amber-100'}>{entry.name}</span>
                  {entry.isMe && <Chip className="ml-2 bg-orange-900/60 text-orange-200 border-orange-700/60">você</Chip>}
                  {entry.guildName && <Chip className="ml-1.5 bg-emerald-950/60 text-emerald-300 border-emerald-800/50">🛡 {entry.guildName}</Chip>}
                  {entry.dragonBallStars && entry.dragonBallStars.length > 0 && (
                    <Chip className="ml-1.5 bg-orange-950/60 text-orange-300 border-orange-800/50">🔮 {entry.dragonBallStars.map((star) => `${star}★`).join(' ')}</Chip>
                  )}
                </td>
                <td className="px-3 py-2.5 text-amber-200/60 text-xs">{RACE_EMOJI[entry.race]} {RACES[entry.race]?.name ?? entry.race}</td>
                <td className="px-3 py-2.5 text-right font-heading text-yellow-300">
                  {formatMetric(playerRankingMetric(entry, category))}
                  {category === 'tournament' && entry.tournamentTitles > 0 ? <span className="text-[10px] text-amber-200/45 ml-1">({entry.tournamentTitles} títulos)</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right font-heading text-amber-300">{entry.level}</td>
                <td className="px-3 py-2.5 text-right font-heading text-orange-400">
                  {entry.power.toLocaleString('pt-BR')}
                  <span className={`ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-heading align-middle ${getPowerScale(entry.power).scale.badge}`}>
                    {getPowerScale(entry.power).scale.emoji} E{getPowerScale(entry.power).scale.index}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {!entry.isMe && entry.attackable ? (
                    <GameButton size="sm" variant="danger" onClick={() => onAttack(entry.id)} disabled={busy || noEnergy} title={noEnergy ? `Energia necessária: ${BATTLE_ENERGY_COST}` : `Atacar ${entry.name}`}>
                      <Crosshair className="w-3.5 h-3.5" /> {noEnergy ? 'Sem energia' : 'Atacar'}
                    </GameButton>
                  ) : <span className="text-amber-200/25">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden space-y-2">
        {ranking.map((entry) => (
          <div key={entry.id} className={`rounded-xl border p-3 flex items-center gap-3 ${entry.isMe ? 'bg-orange-950/40 border-orange-700/60' : 'bg-[#1a140d]/70 border-amber-900/30'}`}>
            <span className="font-heading text-amber-200/50 w-8 text-center">{entry.position === 1 ? '👑' : `${entry.position}º`}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${entry.isMe ? 'text-orange-300 font-heading' : 'text-amber-100'}`}>{entry.name}</p>
              <p className="text-[11px] text-yellow-300">{metricLabel}: {formatMetric(playerRankingMetric(entry, category))}</p>
              <p className="text-[10px] text-amber-200/45">{RACE_EMOJI[entry.race]} Nv {entry.level} · ⚡ {formatMetric(entry.power)}{entry.guildName ? ` · 🛡 ${entry.guildName}` : ''}</p>
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

function GuildRankingTable({ data, category }: { data: RankingPage | null; category: GuildRankingCategory }) {
  const ranking = data?.guildEntries ?? [];
  const metricLabel = GUILD_RANKING_CATEGORIES.find((item) => item.id === category)?.shortLabel ?? 'Valor';
  return (
    <div className="space-y-2">
      {ranking.map((guild) => (
        <GameCard key={guild.id} className={`p-4 ${guild.isMine ? 'ring-1 ring-emerald-500/50' : ''}`}>
          <div className="flex items-start gap-3">
            <span className="font-heading text-xl text-amber-200/50 w-10 text-center">{guild.position === 1 ? '👑' : `${guild.position}º`}</span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-amber-100">{guild.name}</h3>
                {guild.isMine && <Chip className="bg-emerald-950/60 text-emerald-300 border-emerald-700/50">sua guilda</Chip>}
                <Chip className="bg-purple-950/50 text-purple-300 border-purple-800/50">Nv {guild.level}</Chip>
              </div>
              <p className="text-xs text-yellow-300 mt-1">{metricLabel}: <span className="font-heading">{formatMetric(guildRankingMetric(guild, category))}</span></p>
              <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-amber-200/50">
                <span>👥 {guild.memberCount} membros</span>
                <span>⚡ {formatMetric(guild.totalPower)} poder total</span>
                <span>📊 {formatMetric(guild.averagePower)} média</span>
                <span>🏆 {guild.tournamentWins} vitórias · {guild.tournamentTitles} títulos</span>
                <span>🌌 {formatMetric(guild.totalBossDamage)} dano global</span>
              </div>
            </div>
          </div>
        </GameCard>
      ))}
      {ranking.length === 0 && <p className="text-center text-sm text-amber-200/40 py-8">Nenhuma guilda criada ainda.</p>}
    </div>
  );
}
