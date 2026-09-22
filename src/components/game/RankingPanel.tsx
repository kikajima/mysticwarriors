'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RACES, BATTLE_ENERGY_COST } from '@/lib/game/constants';
import {
  GUILD_RANKING_CATEGORIES,
  WARRIOR_RANKING_CATEGORIES,
} from '@/lib/game/ranking';
import { getPowerScale } from '@/lib/game/powerScale';
import type {
  GuildRankingCategory,
  PlayerView,
  RaceId,
  RankingEntry,
  RankingKind,
  RankingPage,
  WarriorRankingCategory,
} from '@/lib/game/types';
import { Chip, GameButton } from './Bits';
import { PublicPlayerIdentity } from './PublicPlayerIdentity';
import { PublicPlayerProfileDialog } from './PublicPlayerProfileDialog';
import { fetchPanelJson, LoadFail, RankingSkeleton } from './PanelLoad';
import { ChevronLeft, ChevronRight, Crosshair, Crown, Shield, Users } from 'lucide-react';

const PAGE_SIZE = 20;
const REFRESH_MS = 60_000;

type RankingData = RankingPage & { source?: 'cloud' | 'local' };

export function RankingPanel({
  player,
  onAttack,
  busy,
}: {
  player: PlayerView;
  onAttack: (targetId: string) => void;
  busy: boolean;
}) {
  const [kind, setKind] = useState<RankingKind>('warriors');
  const [warriorCategory, setWarriorCategory] = useState<WarriorRankingCategory>('level');
  const [guildCategory, setGuildCategory] = useState<GuildRankingCategory>('power');
  const [race, setRace] = useState<RaceId | 'all'>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const category = kind === 'warriors' ? warriorCategory : guildCategory;

  const load = useCallback(
    async (targetPage: number, silent = false) => {
      if (!silent) setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({
          playerId: player.id,
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
          kind,
          category,
        });
        if (kind === 'warriors' && race !== 'all') params.set('race', race);

        const res = await fetchPanelJson(`/api/game/ranking?${params.toString()}`);
        if (!res.ok) {
          console.error('[ranking] FALHA ao buscar — HTTP', res.status);
          if (!silent) setFailed(true);
          return;
        }
        const json = await res.json();
        setData(json.ranking);
        setUpdatedAt(new Date());
      } catch (err) {
        console.error('[ranking] FALHA ao buscar (rede) —', err);
        if (!silent) setFailed(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [category, kind, player.id, race]
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  useEffect(() => {
    const timer = setInterval(() => load(pageRef.current, true), REFRESH_MS);
    const onFocus = () => load(pageRef.current, true);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const changeKind = (next: RankingKind) => {
    setKind(next);
    setPage(1);
    setData(null);
  };

  const changeWarriorCategory = (next: WarriorRankingCategory) => {
    setWarriorCategory(next);
    setPage(1);
    setData(null);
  };

  const changeGuildCategory = (next: GuildRankingCategory) => {
    setGuildCategory(next);
    setPage(1);
    setData(null);
  };

  const changeRace = (next: RaceId | 'all') => {
    setRace(next);
    setPage(1);
    setData(null);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const ranking = data?.entries ?? [];
  const guilds = data?.guilds ?? [];
  const noEnergy = player.energy < BATTLE_ENERGY_COST;
  const currentDefinition =
    kind === 'warriors'
      ? WARRIOR_RANKING_CATEGORIES.find((item) => item.id === warriorCategory)
      : GUILD_RANKING_CATEGORIES.find((item) => item.id === guildCategory);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl sm:text-2xl text-amber-100 flex items-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400" /> Ranking
        </h2>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip className="bg-orange-950/50 text-orange-300 border-orange-800/50">
              {kind === 'guilds' ? 'Sua guilda' : 'Sua posição'}: {data.myPosition ?? '—'}º de {data.total}
            </Chip>
            <Chip className="bg-amber-950/50 text-amber-300/80 border-amber-800/50">
              Atualizado{updatedAt ? ` • ${updatedAt.toLocaleTimeString('pt-BR')}` : ''}
            </Chip>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-900/40 bg-black/20 p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => changeKind('warriors')}
            className={tabClass(kind === 'warriors')}
          >
            <Users className="w-4 h-4" /> Guerreiros
          </button>
          <button
            type="button"
            onClick={() => changeKind('guilds')}
            className={tabClass(kind === 'guilds')}
          >
            <Shield className="w-4 h-4" /> Guildas
          </button>
        </div>

        {kind === 'warriors' ? (
          <>
            <div className="flex flex-wrap gap-2">
              {WARRIOR_RANKING_CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => changeWarriorCategory(item.id)}
                  className={filterClass(warriorCategory === item.id)}
                >
                  <span aria-hidden>{item.icon}</span> {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="ranking-race" className="text-xs font-heading text-amber-200/70">
                Raça
              </label>
              <select
                id="ranking-race"
                value={race}
                onChange={(event) => changeRace(event.target.value as RaceId | 'all')}
                className="rounded-lg border border-amber-800/50 bg-[#160f08] px-3 py-2 text-sm text-amber-100 outline-none focus:border-orange-500"
              >
                <option value="all">Todas as raças</option>
                {(Object.keys(RACES) as RaceId[]).map((raceId) => (
                  <option key={raceId} value={raceId}>
                    {RACE_EMOJI[raceId]} {RACES[raceId].name}
                  </option>
                ))}
              </select>
              {race !== 'all' && (
                <span className="text-xs text-amber-200/45">
                  posição calculada somente entre {RACES[race].name}s
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {GUILD_RANKING_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => changeGuildCategory(item.id)}
                className={filterClass(guildCategory === item.id)}
              >
                <span aria-hidden>{item.icon}</span> {item.label}
              </button>
            ))}
          </div>
        )}

        {currentDefinition && (
          <p className="text-xs text-amber-200/45">
            {currentDefinition.icon} {currentDefinition.description}
          </p>
        )}
      </div>

      {failed && !data ? (
        <LoadFail what="O ranking" onRetry={() => load(page)} />
      ) : loading && !data ? (
        <RankingSkeleton />
      ) : kind === 'guilds' ? (
        <GuildRanking guilds={guilds} category={guildCategory} />
      ) : (
        <WarriorRanking
          entries={ranking}
          category={warriorCategory}
          onAttack={onAttack}
          onProfile={setProfileId}
          busy={busy}
          noEnergy={noEnergy}
        />
      )}

      <PublicPlayerProfileDialog playerId={profileId} onOpenChange={(open) => !open && setProfileId(null)} />

      {data && data.total > 0 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <GameButton
            size="sm"
            variant="ghost"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </GameButton>
          <span className="text-xs font-heading text-amber-200/60">
            Página {page} de {totalPages}
          </span>
          <GameButton
            size="sm"
            variant="ghost"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            Próxima <ChevronRight className="w-4 h-4" />
          </GameButton>
        </div>
      )}
    </div>
  );
}

function WarriorRanking({
  entries,
  category,
  onAttack,
  onProfile,
  busy,
  noEnergy,
}: {
  entries: RankingEntry[];
  category: WarriorRankingCategory;
  onAttack: (targetId: string) => void;
  onProfile: (targetId: string) => void;
  busy: boolean;
  noEnergy: boolean;
}) {
  if (entries.length === 0) {
    return <EmptyRanking text="Nenhum guerreiro encontrado para este filtro." />;
  }

  return (
    <>
      <div className="hidden md:block rounded-xl border border-amber-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-amber-950/60 text-amber-200/80 font-heading text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">#</th>
              <th className="px-3 py-2.5 text-left">Guerreiro</th>
              <th className="px-3 py-2.5 text-left">Raça</th>
              <th className="px-3 py-2.5 text-right">Critério</th>
              <th className="px-3 py-2.5 text-right">Nível</th>
              <th className="px-3 py-2.5 text-right">Poder</th>
              <th className="px-3 py-2.5 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={entry.id}
                className={`border-t border-amber-900/20 ${
                  entry.isMe ? 'bg-orange-950/40' : index % 2 === 0 ? 'bg-[#1a140d]/60' : 'bg-[#161009]/60'
                }`}
              >
                <td className="px-3 py-2.5 text-amber-200/50 font-heading">
                  {entry.position === 1 ? '👑' : `${entry.position}º`}
                </td>
                <td className="px-3 py-2.5">
                  <PublicPlayerIdentity
                    name={entry.name}
                    race={entry.race}
                    avatarUrl={entry.avatarUrl}
                    cosmetics={entry.cosmetics}
                    level={entry.level}
                    compact
                    onClick={entry.id.startsWith('cloud:') ? undefined : () => onProfile(entry.id)}
                  />
                  {entry.isMe && (
                    <Chip className="ml-2 bg-orange-900/60 text-orange-200 border-orange-700/60">você</Chip>
                  )}
                  {entry.guildName && (
                    <Chip className="ml-1.5 bg-emerald-950/60 text-emerald-300 border-emerald-800/50">
                      🛡 {entry.guildName}
                    </Chip>
                  )}
                  {entry.dragonBallStars && entry.dragonBallStars.length > 0 && (
                    <Chip className="ml-1.5 bg-orange-950/60 text-orange-300 border-orange-800/50">
                      🔮 {entry.dragonBallStars.map((star) => `${star}★`).join(' ')}
                    </Chip>
                  )}
                  <p className="mt-1 text-[10px] text-amber-200/35">
                    {entry.battlesWon}V/{entry.battlesLost}D · 🏆 {entry.tournamentWins} vitórias · ☄️{' '}
                    {entry.bossDamage.toLocaleString('pt-BR')} dano
                  </p>
                </td>
                <td className="px-3 py-2.5 text-amber-200/60 text-xs">
                  {RACE_EMOJI[entry.race]} {RACES[entry.race]?.name ?? entry.race}
                </td>
                <td className="px-3 py-2.5 text-right font-heading text-yellow-300">
                  <WarriorMetric entry={entry} category={category} />
                </td>
                <td className="px-3 py-2.5 text-right font-heading text-amber-300">{entry.level}</td>
                <td className="px-3 py-2.5 text-right font-heading text-orange-400">
                  <PowerValue power={entry.power} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  {entry.isMe ? (
                    <span className="text-amber-200/30 text-xs italic">—</span>
                  ) : entry.attackable ? (
                    <GameButton
                      size="sm"
                      variant="danger"
                      onClick={() => onAttack(entry.id)}
                      disabled={busy || noEnergy}
                      title={noEnergy ? `Energia necessária: ${BATTLE_ENERGY_COST}` : `Atacar ${entry.name}`}
                    >
                      <Crosshair className="w-3.5 h-3.5" /> {noEnergy ? 'Sem energia' : 'Atacar'}
                    </GameButton>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-xl border p-3 ${
              entry.isMe ? 'bg-orange-950/40 border-orange-700/60' : 'bg-[#1a140d]/70 border-amber-900/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="font-heading text-amber-200/50 w-8 text-center pt-1">
                {entry.position === 1 ? '👑' : `${entry.position}º`}
              </span>
              <div className="flex-1 min-w-0">
                <PublicPlayerIdentity
                  name={entry.name}
                  race={entry.race}
                  avatarUrl={entry.avatarUrl}
                  cosmetics={entry.cosmetics}
                  level={entry.level}
                  compact
                  onClick={entry.id.startsWith('cloud:') ? undefined : () => onProfile(entry.id)}
                />
                <p className="text-[11px] text-amber-200/50">
                  {RACE_EMOJI[entry.race]} {RACES[entry.race]?.name ?? entry.race}
                </p>
                <p className="mt-1 font-heading text-yellow-300 text-sm">
                  <WarriorMetric entry={entry} category={category} />
                </p>
                <p className="text-[10px] text-amber-200/35">
                  ⚡ {entry.power.toLocaleString('pt-BR')} · 🏆 {entry.tournamentWins} · ☄️{' '}
                  {entry.bossDamage.toLocaleString('pt-BR')}
                  {entry.guildName ? ` · 🛡 ${entry.guildName}` : ''}
                </p>
              </div>
              {!entry.isMe && entry.attackable && (
                <GameButton
                  size="sm"
                  variant="danger"
                  onClick={() => onAttack(entry.id)}
                  disabled={busy || noEnergy}
                  title={noEnergy ? `Energia necessária: ${BATTLE_ENERGY_COST}` : `Atacar ${entry.name}`}
                  aria-label={`Atacar ${entry.name}`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                </GameButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function GuildRanking({
  guilds,
  category,
}: {
  guilds: NonNullable<RankingPage['guilds']>;
  category: GuildRankingCategory;
}) {
  if (guilds.length === 0) {
    return <EmptyRanking text="Ainda não há guildas para classificar." />;
  }

  return (
    <>
      <div className="hidden md:block rounded-xl border border-amber-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-amber-950/60 text-amber-200/80 font-heading text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left">#</th>
              <th className="px-3 py-2.5 text-left">Guilda</th>
              <th className="px-3 py-2.5 text-right">Critério</th>
              <th className="px-3 py-2.5 text-right">Nível</th>
              <th className="px-3 py-2.5 text-right">Poder Total</th>
              <th className="px-3 py-2.5 text-right">Membros</th>
              <th className="px-3 py-2.5 text-left">Líder</th>
            </tr>
          </thead>
          <tbody>
            {guilds.map((guild, index) => (
              <tr
                key={guild.id}
                className={`border-t border-amber-900/20 ${
                  guild.isMine ? 'bg-emerald-950/30' : index % 2 === 0 ? 'bg-[#1a140d]/60' : 'bg-[#161009]/60'
                }`}
              >
                <td className="px-3 py-2.5 text-amber-200/50 font-heading">
                  {guild.position === 1 ? '👑' : `${guild.position}º`}
                </td>
                <td className="px-3 py-2.5">
                  <span className={guild.isMine ? 'text-emerald-300 font-heading' : 'text-amber-100'}>
                    🛡️ {guild.name}
                  </span>
                  {guild.isMine && (
                    <Chip className="ml-2 bg-emerald-950/60 text-emerald-300 border-emerald-700/50">
                      sua guilda
                    </Chip>
                  )}
                  <p className="mt-1 text-[10px] text-amber-200/35">
                    {guild.totalDonated.toLocaleString('pt-BR')} Créditos doados
                  </p>
                </td>
                <td className="px-3 py-2.5 text-right font-heading text-yellow-300">
                  {category === 'power'
                    ? guild.totalPower.toLocaleString('pt-BR')
                    : `Nv ${guild.level}`}
                </td>
                <td className="px-3 py-2.5 text-right font-heading text-amber-300">{guild.level}</td>
                <td className="px-3 py-2.5 text-right font-heading text-orange-400">
                  {guild.totalPower.toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2.5 text-right text-amber-100/70">{guild.memberCount}</td>
                <td className="px-3 py-2.5 text-amber-100/70">{guild.leaderName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {guilds.map((guild) => (
          <div
            key={guild.id}
            className={`rounded-xl border p-3 flex gap-3 ${
              guild.isMine ? 'bg-emerald-950/30 border-emerald-700/50' : 'bg-[#1a140d]/70 border-amber-900/30'
            }`}
          >
            <span className="font-heading text-amber-200/50 w-8 text-center">
              {guild.position === 1 ? '👑' : `${guild.position}º`}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${guild.isMine ? 'text-emerald-300 font-heading' : 'text-amber-100'}`}>
                🛡️ {guild.name}
              </p>
              <p className="mt-1 font-heading text-yellow-300">
                {category === 'power'
                  ? `⚡ ${guild.totalPower.toLocaleString('pt-BR')} de poder`
                  : `🛡️ Nível ${guild.level}`}
              </p>
              <p className="text-[10px] text-amber-200/40">
                Nv {guild.level} · ⚡ {guild.totalPower.toLocaleString('pt-BR')} · 👥 {guild.memberCount} · Líder:{' '}
                {guild.leaderName}
              </p>
              <p className="text-[10px] text-amber-200/30">
                {guild.totalDonated.toLocaleString('pt-BR')} Créditos doados
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function WarriorMetric({
  entry,
  category,
}: {
  entry: RankingEntry;
  category: WarriorRankingCategory;
}) {
  if (category === 'level') return <>📈 Nv {entry.level}</>;
  if (category === 'power') return <PowerValue power={entry.power} />;
  if (category === 'tournament') {
    return (
      <>
        🏆 {entry.tournamentWins.toLocaleString('pt-BR')} vitórias
        {entry.tournamentTitles > 0 ? (
          <span className="block text-[9px] text-amber-200/40">{entry.tournamentTitles} título(s)</span>
        ) : null}
      </>
    );
  }
  return <>☄️ {entry.bossDamage.toLocaleString('pt-BR')}</>;
}

function PowerValue({ power }: { power: number }) {
  const scale = getPowerScale(power).scale;
  return (
    <>
      {power.toLocaleString('pt-BR')}
      <span
        className={`ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-heading align-middle ${scale.badge}`}
        title={`Escala ${scale.index} — ${scale.nome}`}
      >
        <span aria-hidden>{scale.emoji}</span>
        <span className="sr-only">Escala: </span>E{scale.index}
      </span>
    </>
  );
}

function EmptyRanking({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-amber-900/30 bg-black/20 p-8 text-center text-sm text-amber-200/50">
      {text}
    </div>
  );
}

function tabClass(active: boolean): string {
  return `inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-heading transition-colors ${
    active
      ? 'border-orange-500 bg-orange-950/60 text-orange-200'
      : 'border-amber-900/50 bg-black/20 text-amber-200/55 hover:text-amber-100'
  }`;
}

function filterClass(active: boolean): string {
  return `rounded-lg border px-3 py-2 text-xs font-heading transition-colors ${
    active
      ? 'border-yellow-600/70 bg-yellow-950/40 text-yellow-200'
      : 'border-amber-900/40 bg-black/20 text-amber-200/50 hover:text-amber-100'
  }`;
}

const RACE_EMOJI: Record<string, string> = {
  saiyajin: '🐺',
  humano: '🛡️',
  namekuseijin: '🌿',
  androide: '🤖',
  majin: '🌀',
};
