'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RACES, BATTLE_ENERGY_COST } from '@/lib/game/constants';
import { getPowerScale } from '@/lib/game/powerScale';
import type { PlayerView, RankingPage } from '@/lib/game/types';
import { Chip, GameButton } from './Bits';
import { fetchPanelJson, LoadFail, RankingSkeleton } from './PanelLoad';
import { Crosshair, Crown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const PAGE_SIZE = 20;
/** v0.9.5 — dados frescos: enquanto a tela está aberta, atualiza a cada 60s. */
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
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  // v0.9.24 (B1): falha SEM dados → estado amigável + retry (não mais
  // spinner eterno em rede morta — timeout de 8s no fetchPanelJson)
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const load = useCallback(
    async (p: number, silent = false) => {
      if (!silent) setLoading(true);
      setFailed(false);
      try {
        const res = await fetchPanelJson(
          `/api/game/ranking?playerId=${player.id}&page=${p}&pageSize=${PAGE_SIZE}`
        );
        if (!res.ok) {
          console.error('[ranking] FALHA ao buscar — HTTP', res.status);
          if (!silent) setFailed(true);
          return;
        }
        const json = await res.json();
        setData(json.ranking);
        setUpdatedAt(new Date());
      } catch (err) {
        // v0.9.5 — nenhuma falha é silenciosa
        console.error('[ranking] FALHA ao buscar (rede) —', err);
        if (!silent) setFailed(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [player.id]
  );

  // abre a tela (ou troca de página) → busca SEMPRE fresca
  useEffect(() => {
    load(page);
  }, [load, page]);

  // v0.9.5 — enquanto aberta: atualiza a cada 60s; ao voltar o foco: atualiza na hora
  useEffect(() => {
    const timer = setInterval(() => load(pageRef.current, true), REFRESH_MS);
    const onFocus = () => load(pageRef.current, true);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const ranking = data?.entries ?? [];
  // v0.16 — matriz de ocupação: trabalho NÃO bloqueia mais o PvP — o
  // duelista ataca do turno mesmo (o servidor também libera; só
  // treino/PvE/torneio são negados durante o trabalho).
  // v0.6 — duelos PvP gastam energia como qualquer batalha
  const noEnergy = player.energy < BATTLE_ENERGY_COST;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl sm:text-2xl text-amber-100 flex items-center gap-2">
          <Crown className="w-6 h-6 text-yellow-400" /> Ranking dos Guerreiros
        </h2>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip className="bg-orange-950/50 text-orange-300 border-orange-800/50">
              Sua posição: {data.myPosition ?? '—'}º de {data.total}
            </Chip>
            <Chip
              className={
                data.source === 'cloud'
                  ? 'bg-sky-950/50 text-sky-300 border-sky-800/50'
                  : 'bg-amber-950/50 text-amber-300/80 border-amber-800/50'
              }
            >
              Atualizado
              {updatedAt ? ` • ${updatedAt.toLocaleTimeString('pt-BR')}` : ''}
            </Chip>
          </div>
        )}
      </div>

      {failed && !data ? (
        <LoadFail what="O ranking" onRetry={() => load(page)} />
      ) : loading && !data ? (
        <RankingSkeleton />
      ) : (
        <>
          {/* Tabela desktop */}
          <div className="hidden md:block rounded-xl border border-amber-900/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-950/60 text-amber-200/80 font-heading text-xs uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left">#</th>
                  <th className="px-3 py-2.5 text-left">Guerreiro</th>
                  <th className="px-3 py-2.5 text-left">Raça</th>
                  <th className="px-3 py-2.5 text-right">Nível</th>
                  <th className="px-3 py-2.5 text-right">Poder</th>
                  <th className="px-3 py-2.5 text-right">V / D</th>
                  <th className="px-3 py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((entry, i) => (
                  <tr
                    key={entry.id}
                    className={`border-t border-amber-900/20 ${
                      entry.isMe ? 'bg-orange-950/40' : i % 2 === 0 ? 'bg-[#1a140d]/60' : 'bg-[#161009]/60'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-amber-200/50 font-heading">
                      {entry.position === 1 ? '👑' : `${entry.position ?? (data!.page - 1) * PAGE_SIZE + i + 1}º`}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={entry.isMe ? 'text-orange-300 font-heading' : 'text-amber-100'}>{entry.name}</span>
                      {entry.isMe && (
                        <Chip className="ml-2 bg-orange-900/60 text-orange-200 border-orange-700/60">você</Chip>
                      )}
                      {entry.dragonBallStars && entry.dragonBallStars.length > 0 && (
                        <Chip className="ml-1.5 bg-orange-950/60 text-orange-300 border-orange-800/50">
                          🔮 {entry.dragonBallStars.map((star) => `${star}★`).join(' ')}
                        </Chip>
                      )}
                      {entry.guildName && (
                        <Chip className="ml-1.5 bg-emerald-950/60 text-emerald-300 border-emerald-800/50">
                          🛡 {entry.guildName}
                        </Chip>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-amber-200/60 text-xs">
                      {RACE_EMOJI[entry.race]} {RACES[entry.race]?.name ?? entry.race}
                    </td>
                    <td className="px-3 py-2.5 text-right font-heading text-amber-300">{entry.level}</td>
                    <td className="px-3 py-2.5 text-right font-heading text-orange-400">
                      {entry.power.toLocaleString('pt-BR')}
                      <span
                        className={`ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-heading align-middle ${getPowerScale(entry.power).scale.badge}`}
                        title={`Escala ${getPowerScale(entry.power).scale.index} — ${getPowerScale(entry.power).scale.nome}`}
                      >
                        <span aria-hidden>{getPowerScale(entry.power).scale.emoji}</span>
                        <span className="sr-only">Escala: </span>E{getPowerScale(entry.power).scale.index}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      <span className="text-emerald-400">{entry.battlesWon}</span>
                      <span className="text-amber-200/30"> / </span>
                      <span className="text-red-400">{entry.battlesLost}</span>
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

          {/* Lista mobile */}
          <div className="md:hidden space-y-2">
            {ranking.map((entry, i) => (
              <div
                key={entry.id}
                className={`rounded-xl border p-3 flex items-center gap-3 ${
                  entry.isMe ? 'bg-orange-950/40 border-orange-700/60' : 'bg-[#1a140d]/70 border-amber-900/30'
                }`}
              >
                <span className="font-heading text-amber-200/50 w-8 text-center">
                  {entry.position === 1 ? '👑' : `${entry.position ?? (data!.page - 1) * PAGE_SIZE + i + 1}º`}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${entry.isMe ? 'text-orange-300 font-heading' : 'text-amber-100'}`}>
                    {entry.name}
                  </p>
                  <p className="text-[11px] text-amber-200/50">
                    {RACE_EMOJI[entry.race]} Nv {entry.level} • ⚡ {entry.power.toLocaleString('pt-BR')} •{' '}
                    {entry.battlesWon}V/{entry.battlesLost}D
                    {entry.guildName ? ` • 🛡 ${entry.guildName}` : ''}
                    {entry.dragonBallStars && entry.dragonBallStars.length > 0
                      ? ` • 🔮 ${entry.dragonBallStars.map((star) => `${star}★`).join(' ')}`
                      : ''}
                  </p>
                </div>
                {!entry.isMe &&
                  (entry.attackable ? (
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
                  ) : null)}
              </div>
            ))}
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <GameButton size="sm" variant="ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </GameButton>
            <span className="text-xs font-heading text-amber-200/60">
              Página {page} de {totalPages}
            </span>
            <GameButton size="sm" variant="ghost" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              Próxima <ChevronRight className="w-4 h-4" />
            </GameButton>
          </div>

        </>
      )}
    </div>
  );
}

const RACE_EMOJI: Record<string, string> = {
  saiyajin: '🔥',
  humano: '🥋',
  namekuseijin: '🐲',
  androide: '⚡',
  majin: '🍬',
};
