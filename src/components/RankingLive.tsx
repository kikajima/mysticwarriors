'use client';

import { useCallback, useEffect, useState } from 'react';
import { Crown, RefreshCw } from 'lucide-react';
import type { PublicRanking, PublicRankingEntry } from '@/lib/supabase/ranking';
import { getPowerScale } from '@/lib/game/powerScale';

// =====================================================================
// Tabela viva do ranking público (v0.9.5) — roda no navegador:
//  * busca dados frescos SEMPRE que a tela abre;
//  * enquanto aberta, atualiza a cada 60 segundos;
//  * ao voltar o foco para a aba, atualiza na hora;
//  * botão "Atualizar" para conferir na hora (útil para testar).
// A lista vem da NUVEM (todos os personagens salvos no Supabase,
// calculados na hora); se a nuvem falhar, o servidor manda a lista
// dele como reserva — e o selo mostra a fonte em uso.
// =====================================================================

const REFRESH_MS = 60_000;

const RACE_EMOJI: Record<string, string> = {
  saiyajin: '🐺',
  humano: '🛡️',
  namekuseijin: '🌿',
  androide: '🤖',
  majin: '🌀',
};

const RACE_NAME: Record<string, string> = {
  saiyajin: 'Solaris',
  humano: 'Vanguardiano',
  namekuseijin: 'Verdant',
  androide: 'Sintético',
  majin: 'Amorph',
};

export function RankingLive({ initial }: { initial: PublicRanking }) {
  const [data, setData] = useState<PublicRanking>(initial);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/ranking/public', { cache: 'no-store' });
      if (!res.ok) {
        console.error('[ranking] FALHA ao atualizar — HTTP', res.status);
        return;
      }
      const json = (await res.json()) as { ranking?: PublicRanking };
      if (json.ranking) {
        setData(json.ranking);
        setUpdatedAt(new Date());
      }
    } catch (err) {
      console.error('[ranking] FALHA ao atualizar (rede) —', err);
    } finally {
      setBusy(false);
    }
  }, []);

  // abriu a tela → busca fresca imediatamente (não depende do HTML servido)
  useEffect(() => {
    refresh();
  }, [refresh]);

  // enquanto aberta → a cada 60s; voltou o foco → na hora
  useEffect(() => {
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-amber-200/50 text-sm">
          {data.fonte === 'nuvem'
            ? `Top ${data.entries.length} de ${data.total} guerreiro${data.total === 1 ? '' : 's'} — lista ao vivo de todos os personagens salvos na nuvem, sem exceção.`
            : 'Top 25 por nível e poder — reserva do servidor (nuvem indisponível agora).'}
        </p>
        <button
          onClick={refresh}
          disabled={busy}
          className="text-xs text-amber-200/60 hover:text-amber-100 border border-amber-900/40 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          title="Buscar os dados mais recentes agora"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          Atualizar
          {updatedAt ? ` • ${updatedAt.toLocaleTimeString('pt-BR')}` : ''}
        </button>
      </div>

      {data.entries.length === 0 ? (
        <div className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-10 text-center text-amber-200/50">
          Nenhum guerreiro registrado ainda — seja o primeiro a dominar o universo!
        </div>
      ) : (
        <div className="rounded-xl border border-amber-900/40 overflow-hidden bg-[#1a140d]/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-950/60 text-amber-200/80 font-heading text-xs uppercase tracking-wide">
                <th className="px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Guerreiro</th>
                <th className="px-3 py-3 text-left">Raça</th>
                <th className="px-3 py-3 text-right">Nível</th>
                <th className="px-3 py-3 text-right">Poder</th>
                <th className="px-3 py-3 text-right">V / D</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e: PublicRankingEntry) => (
                <tr key={`${e.position}-${e.name}`} className="border-t border-amber-900/20">
                  <td className="px-3 py-2.5 text-amber-200/50 font-heading">
                    {e.position === 1 ? '👑' : `${e.position}º`}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-amber-100">{e.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-amber-200/60 text-xs whitespace-nowrap">
                    {e.race ? `${RACE_EMOJI[e.race] ?? ''} ${RACE_NAME[e.race] ?? e.race}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-heading text-amber-300">{e.level}</td>
                  <td className="px-3 py-2.5 text-right font-heading text-orange-400">
                    {e.power.toLocaleString('pt-BR')}
                    <span
                      className={`ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-heading align-middle ${getPowerScale(e.power).scale.badge}`}
                      title={`Escala ${getPowerScale(e.power).scale.index} — ${getPowerScale(e.power).scale.nome} (ESCALAS DE CAELUM)`}
                    >
                      <span aria-hidden>{getPowerScale(e.power).scale.emoji}</span>
                      <span className="sr-only">Escala: </span>E{getPowerScale(e.power).scale.index}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs whitespace-nowrap">
                    <span className="text-emerald-400">{e.battlesWon ?? '—'}</span>
                    <span className="text-amber-200/30"> / </span>
                    <span className="text-red-400">{e.battlesLost ?? '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-center text-[11px] text-amber-200/40 flex items-center justify-center gap-1.5">
        <Crown className="w-3 h-3" /> Atualiza sozinho a cada 60 segundos enquanto a página estiver aberta.
      </p>
    </div>
  );
}
