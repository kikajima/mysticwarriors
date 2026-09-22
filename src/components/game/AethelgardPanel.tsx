'use client';

import { useState } from 'react';
import type { PlayerView } from '@/lib/game/types';
import { GameButton, GameCard, SectionTitle } from './Bits';
import { Coins, Swords, Heart, BookOpen, Sparkles } from 'lucide-react';

const WISHES = [
  {
    type: 'riqueza' as const,
    title: 'Riqueza Cósmica',
    icon: '💰',
    description: '+8.000 Créditos são transferidos para sua carteira.',
    chip: <Coins className="w-4 h-4 text-yellow-400" />,
  },
  {
    type: 'poder' as const,
    title: 'Despertar de Poder',
    icon: '💪',
    description: '+3 em TODOS os atributos (Força, Defesa, Velocidade e Ki).',
    chip: <Swords className="w-4 h-4 text-orange-400" />,
  },
  {
    type: 'vitalidade' as const,
    title: 'Renovação Vital',
    icon: '❤️',
    description: 'Vida e energia totalmente restauradas, na hora.',
    chip: <Heart className="w-4 h-4 text-red-400" />,
  },
  {
    type: 'sabedoria' as const,
    title: 'Sabedoria Ancestral',
    icon: '📜',
    description: '+1.500 XP de conhecimento de batalha acumulado.',
    chip: <BookOpen className="w-4 h-4 text-emerald-400" />,
  },
];

export function AethelgardPanel({
  player,
  onWish,
  busy,
}: {
  player: PlayerView;
  onWish: (wishType: string) => void;
  busy: boolean;
}) {

  // v0.16 — matriz de ocupação: trabalho NÃO bloqueia desejos (só treino,
  // PvE e torneio). A Convergência pode ser acessada mesmo com o guerreiro no turno.
  const [imgFailed, setImgFailed] = useState(false);
  const hasAll = player.dragonBalls >= 7;

  return (
    <div className="space-y-6">
      <SectionTitle icon="◇">Convergência do Horizonte</SectionTitle>

      {/* Chaves do Horizonte */}
      <GameCard className="p-6 relative overflow-hidden" glow={hasAll}>
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-950/20 via-transparent to-transparent pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-center gap-6 relative">
          <div className={`shrink-0 ${hasAll ? 'animate-float' : 'opacity-80'}`}>
            {imgFailed ? (
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-violet-900 to-slate-950 flex items-center justify-center text-5xl border-2 border-violet-500/40">
                🐉
              </div>
            ) : (
              <img
                src="/images/aethelgard.svg"
                alt="Aethelgard, Guardião Primordial do Horizonte"
                className="w-28 h-28 rounded-2xl object-cover border-2 border-emerald-600/40 shadow-lg shadow-violet-950/60"
                onError={() => setImgFailed(true)}
              />
            )}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="font-heading text-xl text-amber-100 mb-1">
              {hasAll ? 'AS SETE CHAVES ESTÃO REUNIDAS!' : 'Reúna as 7 Chaves do Horizonte'}
            </h3>
            <p className="text-sm text-amber-200/60 leading-relaxed mb-4">
              {hasAll
                ? 'As Chaves entram em ressonância e abrem a Convergência. Aethelgard desperta para conceder uma Bênção Primordial.'
                : 'Use a Busca pelas Chaves em Atividades para rastrear os sete cristais globais. Vitórias no PvP também podem tomar uma Chave do adversário. Reúna todas para abrir a Convergência do Horizonte.'}
            </p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-2" aria-label={`${player.dragonBalls} de 7 Chaves do Horizonte coletadas`}>
              {Array.from({ length: 7 }, (_, i) => {
                const filled = i < player.dragonBalls;
                return (
                  <div
                    key={i}
                    className={`w-10 h-10 rotate-45 rounded-md flex items-center justify-center font-heading text-sm border-2 transition-all ${
                      filled
                        ? 'bg-gradient-to-br from-cyan-200 via-violet-300 to-fuchsia-500 border-cyan-300 shadow-md shadow-violet-900/60 text-slate-950 scale-110'
                        : 'bg-black/50 border-amber-900/40 text-amber-900/40'
                    }`}
                    role="img"
                    aria-label={filled ? `Chave do Horizonte ${i + 1} obtida` : `Chave do Horizonte ${i + 1} faltando`}
                  >
                    <span className="-rotate-45">{filled ? `✦${i + 1}` : '·'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </GameCard>

      {/* Bênçãos Primordiais */}
      {hasAll ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {WISHES.map((wish) => (
            <GameCard key={wish.type} className="p-5 ring-1 ring-yellow-700/40">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-3xl shrink-0" aria-hidden>
                  {wish.icon}
                </div>
                <div>
                  <h4 className="font-heading text-amber-100">{wish.title}</h4>
                  <p className="text-xs text-amber-200/60 mt-1 leading-relaxed">{wish.description}</p>
                </div>
              </div>
              <GameButton
                variant="gold"
                className="w-full"
                onClick={() => onWish(wish.type)}
                disabled={busy}
              >
                <Sparkles className="w-4 h-4" /> Receber {wish.title}
              </GameButton>
            </GameCard>
          ))}
        </div>
      ) : (
        <GameCard className="p-6 text-center">
          <p className="text-amber-200/50 text-sm">
            Faltam <span className="font-heading text-yellow-400 text-lg">{7 - player.dragonBalls}</span>{' '}
            Chaves para abrir a Convergência.
          </p>
        </GameCard>
      )}
    </div>
  );
}
