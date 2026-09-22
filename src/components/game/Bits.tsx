'use client';

import { useState } from 'react';
import { RACES } from '@/lib/game/constants';
import { dominantCosmeticSet, equippedCosmetic } from '@/lib/game/content/cosmetics';
import type { CosmeticsView } from '@/lib/game/types';
import type { RaceId } from '@/lib/game/types';

// ===== Mapas visuais de raça =====
export const RACE_EMOJI: Record<string, string> = {
  saiyajin: '🐺',
  humano: '🛡️',
  namekuseijin: '🌿',
  androide: '🤖',
  majin: '🧬',
};

// v0.16 — RACE_EMOJI_GENDER / GENDER_LABEL / GENDER_SYMBOL / GenderBadge
// REMOVIDOS: gênero deixou de existir como mecânica do jogador
// (decisão definitiva — DESIGN-DECISIONS.md; teste anti-drift vigia a
// não-existência do campo na criação).

export const RACE_GRADIENT: Record<string, string> = {
  saiyajin: 'from-orange-500 to-amber-600',
  humano: 'from-amber-400 to-yellow-600',
  namekuseijin: 'from-emerald-500 to-green-700',
  androide: 'from-slate-400 to-slate-600',
  majin: 'from-rose-400 to-pink-600',
};

export const RACE_TEXT: Record<string, string> = {
  saiyajin: 'text-orange-400',
  humano: 'text-amber-300',
  namekuseijin: 'text-emerald-400',
  androide: 'text-slate-300',
  majin: 'text-rose-400',
};

// ===== Avatar com fallback =====
export function RaceAvatar({
  race,
  className = 'w-16 h-16',
  emojiSize = 'text-3xl',
}: {
  race: string;
  className?: string;
  emojiSize?: string;
}) {
  const [failed, setFailed] = useState(false);
  const info = RACES[race as RaceId];

  const inner =
    failed || !info ? (
      <div
        className={`${className} rounded-full bg-gradient-to-br ${
          RACE_GRADIENT[race] ?? 'from-amber-500 to-orange-700'
        } flex items-center justify-center shrink-0 shadow-lg shadow-orange-900/30 relative`}
        role="img"
        aria-label={`Avatar da raça ${info?.name ?? race}`}
      >
        <span className={emojiSize}>{RACE_EMOJI[race] ?? '🥋'}</span>
      </div>
    ) : (
      <div className="relative shrink-0">
        <img
          src={info.avatar}
          alt={`Avatar da raça ${info.name}`}
          className={`${className} rounded-full object-cover border-2 border-amber-500/40 shadow-lg shadow-orange-900/40`}
          onError={() => setFailed(true)}
        />
      </div>
    );

  return inner;
}

// ===== Avatar do jogador (customizado com fallback racial) =====

/**
 * Aplica os cosméticos visuais de avatar (aura, moldura, overlay dourado,
 * pulso de Ki) ao redor de QUALQUER conteúdo de avatar. Um por slot,
 * vindos do servidor.
 * v0.6: o pulso dourado que era grátis no Dashboard agora é o cosmético
 * "Aura de Ki Pulsante" (avatarPulseCss) — renderiza um gradiente
 * pulsante ATRÁS do retrato, em qualquer tela onde o avatar aparece.
 */
function CosmeticsWrapper({
  cosmetics,
  children,
}: {
  cosmetics?: Pick<CosmeticsView, 'equipped'>;
  children: React.ReactNode;
}) {
  const equipped = cosmetics?.equipped ?? {};
  const aura = equippedCosmetic(equipped, 'aura');
  const glow = aura?.avatarGlowCss;
  const pulse = aura?.avatarPulseCss;
  const frame = equippedCosmetic(equipped, 'frame')?.avatarFrameCss;
  const overlay = equippedCosmetic(equipped, 'avatar')?.avatarOverlayCss;
  const setEffect = dominantCosmeticSet(equipped)?.activeMilestone;
  const setAvatar = setEffect?.avatarCss;
  if (!glow && !frame && !overlay && !pulse && !setAvatar) return <>{children}</>;
  return (
    <span className={`relative inline-flex rounded-full ${glow ?? ''} ${frame ?? ''} ${setAvatar ?? ''}`}>
      {pulse && (
        <span
          className={`absolute -inset-2 rounded-full pointer-events-none ${pulse}`}
          aria-hidden
        />
      )}
      {children}
      {overlay && (
        <span
          className={`absolute inset-0 rounded-full pointer-events-none ${overlay}`}
          aria-hidden
        />
      )}
    </span>
  );
}

export function PlayerAvatar({
  race,
  avatarUrl,
  cosmetics,
  className = 'w-16 h-16',
  emojiSize = 'text-3xl',
}: {
  race: string;
  avatarUrl?: string | null;
  /** cosméticos equipados (aura/moldura/overlay aplicados ao redor) */
  cosmetics?: Pick<CosmeticsView, 'equipped'>;
  className?: string;
  emojiSize?: string;
}) {
  const [failed, setFailed] = useState(false);
  // v0.4 — CORREÇÃO DA TROCA REAL: uma URL nova e válida VOLTA a ser
  // tentada. Sem isto, o primeiro erro de imagem deixava `failed=true`
  // para sempre e o retrato nunca mais mudava (erros atrasados de uma
  // imagem anterior também são descartados quando a URL muda).
  // Padrão React de ajuste durante o render (sem efeitos em cascata):
  const [prevUrl, setPrevUrl] = useState(avatarUrl);
  if (avatarUrl !== prevUrl) {
    setPrevUrl(avatarUrl);
    setFailed(false);
  }

  if (avatarUrl && !failed) {
    return (
      <CosmeticsWrapper cosmetics={cosmetics}>
        <div className="relative shrink-0">
          <img
            key={avatarUrl}
            src={avatarUrl}
            alt="Avatar do guerreiro"
            className={`${className} rounded-full object-cover border-2 border-amber-500/40`}
            onError={() => setFailed(true)}
          />
        </div>
      </CosmeticsWrapper>
    );
  }
  // sem avatarUrl (ou falhou ao carregar) → avatar racial
  return (
    <CosmeticsWrapper cosmetics={cosmetics}>
      <RaceAvatar race={race} className={className} emojiSize={emojiSize} />
    </CosmeticsWrapper>
  );
}

// ===== Barra de recurso =====
export function ResourceBar({
  label,
  icon,
  value,
  max,
  gradient,
  height = 'h-3',
}: {
  label: string;
  icon: string;
  value: number;
  max: number;
  gradient: string;
  height?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full" aria-label={`${label}: ${value} de ${max}`}>
      <div className="flex items-center justify-between text-[11px] font-heading text-amber-200/80 mb-1">
        <span className="flex items-center gap-1">
          <span aria-hidden>{icon}</span> {label}
        </span>
        <span className="tabular-nums">
          {value} / {max}
        </span>
      </div>
      <div className={`relative w-full ${height} bg-black/50 rounded-full overflow-hidden border border-amber-900/40`}>
        <div
          className={`relative h-full overflow-hidden bg-gradient-to-r ${gradient} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        >
          {/* v0.9.12 — detalhe: brilho deslizante ("energia viva") sobre o
              PREENCHIMENTO (nunca sobre a parte vazia); puro enfeite, some
              em prefers-reduced-motion */}
          {pct > 4 && <span className="bar-sheen" aria-hidden />}
        </div>
      </div>
    </div>
  );
}

// ===== Título de seção =====
export function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-xl sm:text-2xl text-amber-100 flex items-center gap-2 mb-4 relative pb-2">
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      {children}
      {/* v0.9.12 — filete de gradiente sob o título (hierarquia visual) */}
      <span
        className="absolute left-0 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-amber-500/70 via-orange-500/40 to-transparent"
        style={{ width: '38%' }}
        aria-hidden
      />
    </h2>
  );
}

// ===== Botão de ação do jogo =====
export function GameButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
  size = 'md',
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'ghost' | 'gold';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}) {
  const base =
    'font-heading inline-flex items-center justify-center gap-1.5 rounded-lg transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#14100b]';
  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  };
  const variants = {
    primary:
      'bg-gradient-to-b from-orange-500 to-amber-700 text-white shadow-md shadow-orange-900/40 hover:from-orange-400 hover:to-amber-600 hover:shadow-orange-700/50',
    danger:
      'bg-gradient-to-b from-red-600 to-red-800 text-white shadow-md shadow-red-900/40 hover:from-red-500 hover:to-red-700',
    gold: 'bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 font-bold shadow-md shadow-amber-900/40 hover:from-yellow-300 hover:to-amber-500',
    ghost:
      'bg-white/5 text-amber-200 border border-amber-800/50 hover:bg-white/10 hover:border-amber-600/50',
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

// ===== Selo/badge =====
export function Chip({
  children,
  className = 'bg-amber-900/40 text-amber-200 border-amber-700/50',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${className}`}
    >
      {children}
    </span>
  );
}

// ===== Cartão base =====
export function GameCard({
  children,
  className = '',
  glow = false,
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  /** v0.9.12 — cartão com AFINIDADE CLICÁVEL (ex.: oponentes da arena):
   * leve elevação + moldura âmbar no hover e foco interno — sinais de
   * "isto aqui reage" sem tocar nos cartões puramente informativos. */
  interactive?: boolean;
}) {
  return (
    <div
      className={`bg-[#1e1710]/90 border border-amber-900/40 rounded-xl shadow-lg shadow-black/30 ${
        glow ? 'aura' : ''
      } ${
        interactive
          ? 'transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-700/60 hover:shadow-amber-950/40 focus-within:border-amber-700/60 focus-within:shadow-amber-950/40'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
