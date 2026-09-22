'use client';

import { useState } from 'react';
import { RACE_LIST, RACES, randomWarriorName } from '@/lib/game/constants';
import type { PlayerView, RaceId } from '@/lib/game/types';
import { GameButton, RACE_EMOJI, RACE_GRADIENT } from './Bits';
import { Dices, ArrowLeft } from 'lucide-react';

export function CharacterCreate({
  onCreated,
  onBack,
}: {
  onCreated: (player: PlayerView) => void;
  onBack?: () => void;
}) {
  const [name, setName] = useState('');
  const [race, setRace] = useState<RaceId>('saiyajin');
  // v0.16 — sem campo de gênero: a criação é nome + raça (decisão
  // definitiva — DESIGN-DECISIONS.md; teste anti-drift vigia o contrato).
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [rolling, setRolling] = useState(false);

  const rollName = () => {
    setRolling(true);
    // pequena animação de "rolagem" antes de fixar o nome
    let ticks = 0;
    const interval = setInterval(() => {
      setName(randomWarriorName());
      ticks += 1;
      if (ticks >= 7) {
        clearInterval(interval);
        setRolling(false);
      }
    }, 70);
  };

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) {
      setError('Escolha um nome com pelo menos 2 caracteres!');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), race }),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setError(data.error?.message ?? 'Erro ao criar guerreiro');
        return;
      }
      onCreated(data.player);
    } catch {
      setError('Falha de conexão com o servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Banner */}
      <div className="relative w-full h-56 sm:h-72 overflow-hidden">
        {bannerFailed ? (
          <div className="absolute inset-0 bg-gradient-to-b from-orange-900 via-amber-950 to-[#14100b] flex items-center justify-center">
            <span className="text-7xl" aria-hidden>
              🐉
            </span>
          </div>
        ) : (
          <img
            src="/images/banner.png"
            alt="Myst Ki Warriors carregando energia ao pôr do sol"
            className="absolute inset-0 w-full h-full object-cover opacity-80"
            onError={() => setBannerFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#14100b] via-transparent to-black/30" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="font-display text-5xl sm:text-7xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-orange-400 to-amber-600 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] tracking-wide">
            Myst Ki Warriors
          </h1>
          <p className="font-heading text-amber-200/90 text-sm sm:text-base mt-2 max-w-xl">
            Treine. Lute. Trabalhe. Colete as 7 Chaves do Horizonte e domine o universo!
          </p>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        {onBack && (
          <button
            onClick={onBack}
            className="text-sm text-amber-200/60 hover:text-amber-100 transition-colors font-heading inline-flex items-center gap-1.5 mb-5"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para seleção
          </button>
        )}

        <div className="mb-6">
          <label htmlFor="warrior-name" className="font-heading text-amber-100 text-lg block mb-2">
            1. Escolha o nome do seu guerreiro
          </label>
          <div className="flex gap-2 max-w-md">
            <input
              id="warrior-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              maxLength={20}
              placeholder="Ex: Gotan, Príncipe Escarlate, Kurira do Deserto..."
              className="flex-1 min-w-0 bg-black/40 border border-amber-800/50 rounded-lg px-4 py-3 text-amber-100 placeholder:text-amber-200/30 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-900/50 font-heading"
            />
            <button
              type="button"
              onClick={rollName}
              disabled={rolling}
              title="Sortear nome aleatório"
              aria-label="Sortear nome aleatório de guerreiro"
              className="shrink-0 w-14 flex items-center justify-center rounded-lg bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 shadow-md shadow-amber-900/40 hover:from-yellow-300 hover:to-amber-500 transition-all active:scale-95 disabled:opacity-60 border border-amber-500/50"
            >
              <Dices className={`w-6 h-6 ${rolling ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-[11px] text-amber-200/40 mt-1.5">
            Sem ideias? Clique no 🎲 e deixe o destino escolher o nome do seu guerreiro.
          </p>
          {error && (
            <p role="alert" className="text-red-400 text-sm mt-2">
              ⚠ {error}
            </p>
          )}
        </div>

        <h2 className="font-heading text-amber-100 text-lg mb-3">2. Escolha sua raça</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {RACE_LIST.map((r) => {
            const selected = race === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRace(r.id)}
                aria-pressed={selected}
                className={`text-left rounded-xl border p-4 transition-all duration-200 ${
                  selected
                    ? 'border-orange-500 bg-gradient-to-b from-orange-950/60 to-[#1e1710] scale-[1.02] shadow-lg shadow-orange-900/40'
                    : 'border-amber-900/40 bg-[#1e1710]/80 hover:border-amber-600/60'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-12 h-12 rounded-full bg-gradient-to-br ${RACE_GRADIENT[r.id]} flex items-center justify-center text-2xl shrink-0`}
                    role="img"
                    aria-label={`Raça ${r.name}`}
                  >
                    {RACE_EMOJI[r.id]}
                  </div>
                  <div>
                    <h3 className="font-heading text-amber-100 text-lg leading-tight">{r.name}</h3>
                    <p className="text-amber-200/60 text-xs italic">{r.tagline}</p>
                  </div>
                </div>
                <p className="text-xs text-amber-100/70 mb-3 leading-relaxed">{r.description}</p>

              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <GameButton size="lg" variant="gold" onClick={submit} disabled={loading}>
            {loading ? 'Invocando guerreiro...' : `⚔️ Começar como ${RACES[race].name}`}
          </GameButton>
          <p className="text-amber-200/50 text-xs max-w-xs text-center sm:text-left">
            {onBack
              ? 'O personagem ficará salvo na sua conta — troque de guerreiro quando quiser.'
              : 'Jogue como convidado e use “Salvar meu guerreiro” depois para garantir o progresso. Você ganha 500 Créditos para começar.'}
          </p>
        </div>
      </div>

      <footer className="mt-auto py-4 text-center text-amber-200/30 text-xs">
        Myst Ki Warriors — um jogo de gerenciamento inspirado nos clássicos browsers games
      </footer>
    </div>
  );
}
