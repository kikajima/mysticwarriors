'use client';

import { HpRecovery } from './HpRecovery';
import { useEffect } from 'react';
import { RACES, getItem, getTechnique, trainingCost, getStrategy, getProfession, professionLevel, professionLevelTitle } from '@/lib/game/constants';
import { activeCosmeticSets, dominantCosmeticSet, equippedCosmetic } from '@/lib/game/content/cosmetics';
import { useServerNow } from '@/lib/game/clock';
import { EQUIPPED_SLOTS, type PlayerView } from '@/lib/game/types';
import { Chip, GameCard, PlayerAvatar, RACE_EMOJI, ResourceBar, GameButton } from './Bits';
import { getPowerScale, POWER_SCALES } from '@/lib/game/powerScale';
import { useToast } from '@/hooks/use-toast';
import { Swords, Shield, Gauge, Sparkles, Trophy, Hourglass, GraduationCap, Zap, Crown, Target, Flame, ChevronRight, Image as ImageIcon, AlertTriangle } from 'lucide-react';

const STAT_KEYS = ['strength', 'defense', 'speed', 'ki'] as const;
type DisplayStat = (typeof STAT_KEYS)[number];

const STAT_META: Record<DisplayStat, { label: string; icon: React.ReactNode }> = {
  strength: { label: 'Força', icon: <Swords className="w-4 h-4" /> },
  defense: { label: 'Defesa', icon: <Shield className="w-4 h-4" /> },
  speed: { label: 'Velocidade', icon: <Gauge className="w-4 h-4" /> },
  ki: { label: 'Ki', icon: <Sparkles className="w-4 h-4" /> },
};

function equippedBonusForStat(player: PlayerView, key: DisplayStat): number {
  const itemStat = key === 'strength' ? 'atk' : key === 'defense' ? 'def' : key === 'speed' ? 'spd' : 'ki';
  return EQUIPPED_SLOTS.reduce((sum, slot) => {
    const itemId = player.items[slot] ?? null;
    const item = itemId ? getItem(itemId) : undefined;
    return sum + (item?.[itemStat] ?? 0);
  }, 0);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'pronta!';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Segundos até o próximo ponto de energia (com bônus racial). */
function secondsToNextEnergy(player: PlayerView, now: number): number | null {
  if (player.energy >= player.derived.maxEnergy) return null; // cheio → esconde
  const interval = Math.max(1, player.regen.energyIntervalSec);
  const elapsed = (now - new Date(player.regen.lastRegenAt).getTime()) / 1000;
  const next = interval - (elapsed % interval);
  return Math.max(1, Math.ceil(next));
}

export function Dashboard({
  player,
  onNavigate,
  onOpenAvatar,
}: {
  player: PlayerView;
  onNavigate: (view: string) => void;
  onOpenAvatar: () => void;
}) {
  const race = RACES[player.race];
  // v0.9.6 (Mudança 1): todos os contadores da ficha (turno de profissão,
  // próxima energia) usam o RELÓGIO DO SERVIDOR — os timestamps de fim e
  // os relógios de regeneração são gravados pelo servidor (UTC).
  const now = useServerNow(1000);

  // v0.4: activeMission (rodando) OU claimableMission (pronta p/ coletar)
  // v0.6: missionId guarda o id da PROFISSÃO em turno
  const active = player.activeMission;
  const claimable = player.claimableMission;
  const activeProfession = active
    ? getProfession(active.missionId)
    : claimable
      ? getProfession(claimable.missionId)
      : null;
  const missionDone = !!claimable;
  const remaining = active ? new Date(active.endsAt).getTime() - now : 0;
  const strategy = getStrategy(player.strategy);
  const nextEnergyIn = secondsToNextEnergy(player, now);
  // ===== Escala de Poder (ASCENSÃO Z, Cap. 5) =====
  const scaleInfo = getPowerScale(player.derived.power);

  // ===== ASCENSÃO DE ESCALA: celebra quando o guerreiro sobe de escala =====
  // Linha de base por NOME (nunca por id — nada de id no localStorage).
  // Primeira visita registra sem alarde; reset de personagem rebaixa a
  // linha de base em silêncio; só a SUBIDA dispara a celebração.
  const { toast } = useToast();
  const scaleIndex = scaleInfo.scale.index;
  const scaleKey = `gm-ascensao-${player.name}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(scaleKey);
      const current = scaleIndex;
      if (raw === null) {
        window.localStorage.setItem(scaleKey, String(current));
        return;
      }
      const prev = Number(raw);
      if (!Number.isFinite(prev) || current === prev) return;
      window.localStorage.setItem(scaleKey, String(current));
      if (current > prev) {
        toast({
          title: '🚀 ASCENSÃO DE ESCALA!',
          description: `${player.name} rompeu os próprios limites: agora é ${scaleInfo.scale.emoji} ${scaleInfo.scale.nome} (Escala ${current}/9). ${scaleInfo.scale.desc}`,
          className: 'border-amber-500 bg-gradient-to-r from-amber-950 to-orange-950 text-amber-100',
          duration: 8000,
        });
      }
    } catch {
      // localStorage bloqueado (modo privado etc.) — celebração simplesmente não roda
    }
  }, [scaleKey, scaleIndex, player.name, scaleInfo.scale, toast]);

  // ===== Cosméticos equipados (v0.5) — efeitos VISÍVEIS na ficha =====
  const equipped = player.cosmetics?.equipped ?? {};
  const profileBg = equippedCosmetic(equipped, 'background')?.profileBgCss;
  const playerTitle = equippedCosmetic(equipped, 'title');
  const poseBadge = equippedCosmetic(equipped, 'pose')?.profileBadge;
  const outfitBadge = equippedCosmetic(equipped, 'outfit')?.profileBadge;
  // v0.6 — aura do CARD virou cosmético (antes era grátis em toda ficha)
  const cardAuraCss = equippedCosmetic(equipped, 'card')?.cardGlowCss;
  const activeSets = activeCosmeticSets(equipped);
  const dominantSet = dominantCosmeticSet(equipped);

  return (
    <div className="space-y-6">
      {/* ===== BANNER: EM TURNO DE TRABALHO ===== */}
      {active && !missionDone && (
        <div
          role="status"
          className="rounded-xl border border-orange-500/50 bg-gradient-to-r from-orange-950/80 via-[#241708] to-amber-950/60 px-4 py-3 flex items-start gap-3 shadow-lg shadow-orange-950/40"
        >
          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed">
            <p className="font-heading text-orange-200">Você está trabalhando!</p>

          </div>
          <GameButton size="sm" variant="ghost" className="ml-auto shrink-0" onClick={() => onNavigate('missions')}>
            Profissões <ChevronRight className="w-3.5 h-3.5" />
          </GameButton>
        </div>
      )}

      {/* ===== FICHA DO PERSONAGEM (estilo RPG) =====
           v0.6: o glow que era GRÁTIS foi removido — agora é o cosmético
           "Aura Ancestral do Card" (slot 'card', comprado com diamantes) */}
      <GameCard className={`p-5 sm:p-7 relative overflow-hidden ${cardAuraCss ?? ''} ${dominantSet?.activeMilestone.profileCss ?? ''}`}>
        <div
          className={`absolute inset-0 pointer-events-none ${
            profileBg ?? 'bg-gradient-to-br from-orange-950/50 via-transparent to-amber-950/30'
          }`}
          aria-hidden
        />
        <div className="absolute -right-8 -top-8 text-[10rem] opacity-5 select-none pointer-events-none" aria-hidden>
          {RACE_EMOJI[player.race]}
        </div>

        <div className="relative flex flex-col sm:flex-row items-center gap-5 sm:gap-7">
          {/* Avatar (v0.6: aura pulsante = cosmético "Aura de Ki Pulsante") */}
          <div className="relative shrink-0">
            <PlayerAvatar
              race={player.race}
              avatarUrl={player.avatarUrl}
              cosmetics={player.cosmetics}
              className="w-28 h-28 sm:w-32 sm:h-32 relative"
              emojiSize="text-5xl"
            />
            {player.transformation && (
              <span
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-2xl drop-shadow-lg"
                title={`Transformação ativa: ${player.transformation.name}`}
              >
                {player.transformation.icon}
              </span>
            )}
            <button
              onClick={onOpenAvatar}
              title="Mudar avatar (URL ou upload)"
              aria-label="Mudar avatar"
              className="absolute -top-1 -right-1 w-9 h-9 rounded-full bg-gradient-to-b from-yellow-400 to-amber-600 text-amber-950 shadow-lg shadow-amber-900/50 flex items-center justify-center hover:from-yellow-300 hover:to-amber-500 transition-all active:scale-95 border-2 border-[#14100b]"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Identidade */}
          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex flex-wrap items-start justify-center sm:justify-start gap-2 mb-1 overflow-visible">
              <div className="min-w-0 overflow-visible pb-1 pr-1">
                <h2 className="font-display font-display-safe text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-orange-500 tracking-wide break-words">
                  {player.name}
                </h2>
              </div>
              {playerTitle && (
                <span title={`Título equipado: ${playerTitle.name}`}>
                  <Chip className="bg-yellow-950/70 text-yellow-300 border-yellow-600/60">
                    {playerTitle.icon} {playerTitle.titleText}
                  </Chip>
                </span>
              )}
              {player.guild && (
                <Chip className="bg-emerald-950/60 text-emerald-300 border-emerald-800/50">
                  🛡 {player.guild.name}{player.guild.isLeader ? ' 👑' : ''}
                </Chip>
              )}
            </div>

            <p className="text-amber-200/60 text-xs italic mb-2">
              {RACE_EMOJI[player.race]} {race.name} · {race.tagline}
            </p>

            {(poseBadge || outfitBadge || activeSets.length > 0) && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mb-2">
                {poseBadge && (
                  <Chip className="bg-fuchsia-950/50 text-fuchsia-300 border-fuchsia-800/50">
                    {poseBadge.icon} {poseBadge.label}
                  </Chip>
                )}
                {outfitBadge && (
                  <Chip className="bg-slate-900/60 text-slate-200 border-slate-600/50">
                    {outfitBadge.icon} {outfitBadge.label}
                  </Chip>
                )}
                {activeSets.map((progress) => (
                  <Chip key={progress.set.id} className={progress.activeMilestone.badgeCss}>
                    {progress.set.icon} {progress.activeMilestone.name}
                  </Chip>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mb-3">
              <Chip className="bg-orange-900/60 text-orange-300 border-orange-700/50 text-xs px-2.5 py-1">
                ⭐ Nível {player.level}
              </Chip>
              {player.transformation ? (
                <Chip className="bg-purple-950/60 text-purple-300 border-purple-700/50 text-xs px-2.5 py-1">
                  {player.transformation.icon} {player.transformation.name}
                </Chip>
              ) : (
                <Chip className="bg-black/40 text-amber-200/60 border-amber-900/50 text-xs px-2.5 py-1">
                  forma base
                </Chip>
              )}
              <Chip className="bg-black/40 text-amber-200/70 border-amber-900/50 text-xs px-2.5 py-1">
                {strategy.icon} {strategy.name}
              </Chip>
              {player.rankingPosition && (
                <Chip className="bg-yellow-950/60 text-yellow-300 border-yellow-700/50 text-xs px-2.5 py-1">
                  <Crown className="w-3 h-3" /> {player.rankingPosition}º no ranking
                </Chip>
              )}
            </div>

            {/* Poder de luta */}
            <div className="flex items-baseline justify-center sm:justify-start gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-amber-200/50 font-heading">
                Poder de Luta
              </span>
              <span className="font-heading text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-500">
                {player.derived.power.toLocaleString('pt-BR')}
              </span>
            </div>

            {/* Escala de Poder — ASCENSÃO Z (Cap. 5) */}
            <div className="flex justify-center sm:justify-start">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-heading tracking-wide ${scaleInfo.scale.badge}`}
                title={`Escala ${scaleInfo.scale.index} — ${scaleInfo.scale.desc}`}
              >
                <span aria-hidden>{scaleInfo.scale.emoji}</span>
                <span className="sr-only">Escala {scaleInfo.scale.index}: </span>
                {scaleInfo.scale.nome}
              </span>
            </div>
          </div>
        </div>

        {/* Barra de XP — v0.6: mostra quanto TEM e quanto FALTA p/ o próximo nível */}
        <div className="relative mt-5">
          <ResourceBar
            label={`Experiência (faltam ${Math.max(0, player.xpToNext - player.xp).toLocaleString('pt-BR')} p/ o nível ${player.level + 1})`}
            icon="⭐"
            value={player.xp}
            max={player.xpToNext}
            gradient="from-orange-400 to-red-500"
            height="h-3"
          />
        </div>
      </GameCard>

      {/* ===== BARRAS DE RECURSO ===== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GameCard className="p-4">
          <ResourceBar label="Vida (HP)" icon="❤️" value={player.hp} max={player.derived.maxHp} gradient="from-red-500 to-rose-700" height="h-4" />
          <HpRecovery player={player} />
        </GameCard>
        <GameCard className="p-4">
          <ResourceBar label="Energia" icon="⚡" value={player.energy} max={player.derived.maxEnergy} gradient="from-yellow-400 to-amber-600" height="h-4" />
          {nextEnergyIn !== null ? (
            <p
              className="text-[11px] text-amber-300/80 mt-2 tabular-nums"
              aria-live="polite"
              title="Tempo até o próximo ponto de energia (≈ 5 min por ponto)"
            >
              ⏳ Próxima energia em ~{nextEnergyIn >= 60
                ? `${Math.floor(nextEnergyIn / 60)}m ${String(nextEnergyIn % 60).padStart(2, '0')}s`
                : `${nextEnergyIn}s`}
            </p>
          ) : (
            <p className="text-[11px] text-amber-200/40 mt-2">Energia cheia</p>
          )}
        </GameCard>
        <GameCard className="p-4 flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-heading text-amber-200/80 flex items-center gap-1">
              <span aria-hidden>🪙</span> Carteira
            </span>
            <span className="text-[11px] font-heading text-amber-200/80 flex items-center gap-1">
              <span aria-hidden>💎</span> {player.crystals}
            </span>
          </div>
          <p className="font-heading text-2xl text-yellow-400">
            {player.zeni.toLocaleString('pt-BR')} <span className="text-sm text-amber-200/50">Créditos</span>
          </p>
          <div className="mt-auto pt-2 flex items-center gap-2 text-[11px] text-amber-200/40">
            <span>🔮 Chaves: {player.dragonBalls}/7</span>
            {player.dragonBalls >= 7 && (
              <button onClick={() => onNavigate('shenron')} className="text-yellow-300 underline hover:text-yellow-200">
                invocar Aethelgard!
              </button>
            )}
          </div>
        </GameCard>
      </div>

      {/* ===== TRABALHO ATUAL / OBJETIVO ATUAL ===== */}
      <GameCard className={`p-5 ${missionDone ? 'ring-1 ring-emerald-500/50' : active ? 'ring-1 ring-orange-500/40' : ''}`}>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-orange-400" />
          <h3 className="font-heading text-amber-100 text-sm uppercase tracking-wide">Objetivo Atual</h3>
        </div>
        {active && activeProfession ? (
          <div className="flex items-center gap-4">
            <div className="text-4xl shrink-0" aria-hidden>
              {missionDone ? '🎁' : activeProfession.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading text-amber-100">
                {activeProfession.name} —{' '}
                {professionLevelTitle(professionLevel(player.professions?.[activeProfession.id]))}
              </p>
              {missionDone ? (
                <p className="text-sm text-emerald-300 mt-0.5">Pagamento pronto! Colete na aba Profissões.</p>
              ) : (
                <p className="font-heading text-xl text-amber-200 tabular-nums mt-0.5">⏳ {formatCountdown(remaining)}</p>
              )}
            </div>
            <GameButton size="sm" variant={missionDone ? 'gold' : 'ghost'} onClick={() => onNavigate('missions')}>
              Profissões <ChevronRight className="w-3.5 h-3.5" />
            </GameButton>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="text-4xl shrink-0" aria-hidden>
              💼
            </div>
            <div className="flex-1">
              <p className="font-heading text-amber-100">Sem trabalho em andamento</p>

            </div>
            <GameButton size="sm" onClick={() => onNavigate('missions')}>
              Ir ao trabalho <ChevronRight className="w-3.5 h-3.5" />
            </GameButton>
          </div>
        )}
      </GameCard>

      {/* ===== ESCALA DE PODER (ASCENSÃO Z, Cap. 5) ===== */}
      <GameCard className="p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-heading text-amber-100 flex items-center gap-2">
              <Target className="w-4 h-4" /> Escala de Poder
            </h3>

          </div>
          <div className="text-right shrink-0">
            <span
              className={`scale-seal inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 font-heading text-sm ${scaleInfo.scale.badge}`}
              title={`Escala ${scaleInfo.scale.index} — ${scaleInfo.scale.desc}`}
            >
              <span aria-hidden className="text-lg">{scaleInfo.scale.emoji}</span>
              {scaleInfo.scale.nome}
            </span>
            <p className="text-[10px] text-amber-200/40 mt-1.5 font-heading tracking-widest">
              ESCALA {scaleInfo.scale.index} / 9
            </p>
          </div>
        </div>

        {/* Progresso rumo à próxima escala */}
        {scaleInfo.next ? (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-amber-200/50 mb-1.5">
              <span className="flex items-center gap-1.5">
                <span aria-hidden>{scaleInfo.next.emoji}</span> Próxima: {scaleInfo.next.nome}
              </span>
              <span>
                faltam{' '}
                <strong className="text-amber-200/90 font-heading">
                  {scaleInfo.powerToNext.toLocaleString('pt-BR')}
                </strong>{' '}
                de poder
              </span>
            </div>
            <div
              className="h-2.5 rounded-full bg-black/40 border border-amber-900/30 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(scaleInfo.progress * 100)}
              aria-label={`Progresso para a escala ${scaleInfo.next.nome}`}
            >
              <div
                className={`h-full rounded-full bg-gradient-to-r ${scaleInfo.scale.bar} transition-all duration-700`}
                style={{ width: `${Math.max(3, Math.round(scaleInfo.progress * 100))}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 h-2.5 rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 border border-amber-500/40" />
        )}

        {/* Trilha de escalas — marcos visíveis */}
        <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1" aria-hidden>
          {POWER_SCALES.map((s) => (
            <div
              key={s.index}
              title={`${s.emoji} ${s.nome} — escala ${s.index}`}
              className={`flex-1 min-w-[10px] h-1.5 rounded-full transition-colors ${
                s.index < scaleInfo.scale.index
                  ? 'bg-amber-500/50'
                  : s.index === scaleInfo.scale.index
                    ? 'bg-gradient-to-r ' + s.bar
                    : 'bg-black/40'
              }`}
            />
          ))}
        </div>
      </GameCard>

      {/* ===== ATRIBUTOS ===== */}
      <div>
        <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2">
          <Flame className="w-4 h-4" /> Atributos de Batalha
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STAT_KEYS.map((key) => {
            const base = player[key];
            // O cliente recalcula pelos slots equipados para que saves/API
            // antigos nunca façam o painel voltar a exibir só o atributo base.
            const localEquipmentBonus = equippedBonusForStat(player, key);
            const serverEquipmentBonus = player.derived.equipmentBonuses?.[key];
            const bonus =
              serverEquipmentBonus !== undefined && serverEquipmentBonus === localEquipmentBonus
                ? serverEquipmentBonus
                : localEquipmentBonus;
            const total = base + bonus;
            return (
              <GameCard key={key} className="p-4">
                <div className="flex items-start justify-between mb-1 gap-3">
                  <span className="font-heading text-amber-200 text-sm flex items-center gap-1.5">
                    {STAT_META[key].icon} {STAT_META[key].label}
                  </span>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-wider text-orange-200/50">Total com equipamento</p>
                    <span className="font-heading text-3xl text-orange-400 tabular-nums">{total}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Chip className="bg-black/30 text-amber-200/60 border-amber-900/40 text-[10px]">
                    Base {base}
                  </Chip>
                  <span className="text-amber-200/30 text-[10px]">+</span>
                  <Chip className={`text-[10px] ${
                    bonus > 0
                      ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50'
                      : 'bg-black/30 text-amber-200/35 border-amber-900/30'
                  }`}>
                    Equipamento {bonus > 0 ? `+${bonus}` : '+0'}
                  </Chip>
                  <span className="text-amber-200/30 text-[10px]">=</span>
                  <Chip className="bg-orange-950/45 text-orange-300 border-orange-800/50 text-[10px]">
                    Total {total}
                  </Chip>
                </div>
                <p className="text-[10px] text-amber-200/35 mt-1">
                  O número grande acima já inclui todos os 8 espaços equipáveis.
                </p>

                <button
                  onClick={() => onNavigate('training')}
                  className="text-[10px] text-amber-200/30 mt-2 hover:text-orange-300 transition-colors"
                >
                  treinar base por {trainingCost(base, player.race).toLocaleString('pt-BR')} Créditos →
                </button>
              </GameCard>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LOADOUT + estratégia */}
        <GameCard className="p-5">
          <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Preparação de Combate
          </h3>
          <p className="text-[11px] text-amber-200/40 mb-3">
            Estratégia: <span className="text-amber-200/80">{strategy.icon} {strategy.name}</span>
          </p>
          <div className="space-y-2">
            {(['1', '2', '3', 'S'] as const).map((slot) => {
              const tech = player.loadout[slot] ? getTechnique(player.loadout[slot]!) : null;
              return (
                <div
                  key={slot}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                    tech
                      ? slot === 'S'
                        ? 'bg-purple-950/40 border-purple-800/50'
                        : 'bg-orange-950/30 border-orange-800/40'
                      : 'bg-black/30 border-amber-900/30 border-dashed'
                  }`}
                >
                  <span className="text-[10px] text-amber-200/40 uppercase tracking-wide font-heading w-14">
                    {slot === 'S' ? 'Suprema' : `Técnica ${slot}`}
                  </span>
                  {tech ? (
                    <span className="text-sm text-amber-100">
                      {tech.icon} {tech.name}{' '}

                    </span>
                  ) : (
                    <span className="text-sm text-amber-200/30 italic">vazio</span>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => onNavigate('training')}
            className="mt-3 text-xs text-orange-300 hover:text-orange-200 font-heading inline-flex items-center gap-1"
          >
            <GraduationCap className="w-3.5 h-3.5" /> aprender/equipar técnicas →
          </button>
        </GameCard>

        {/* Histórico */}
        <GameCard className="p-5">
          <h3 className="font-heading text-amber-100 mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Histórico de Guerreiro
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-black/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-heading text-emerald-400">{player.battlesWon}</p>
              <p className="text-[11px] text-amber-200/50">Vitórias</p>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-heading text-red-400">{player.battlesLost}</p>
              <p className="text-[11px] text-amber-200/50">Derrotas</p>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-heading text-amber-300">{player.missionsDone}</p>
              <p className="text-[11px] text-amber-200/50">Trabalhos</p>
            </div>
            <div className="bg-black/30 rounded-lg p-3 text-center">
              <p className="text-2xl font-heading text-orange-300">
                {player.battlesWon + player.battlesLost > 0
                  ? Math.round((player.battlesWon / (player.battlesWon + player.battlesLost)) * 100)
                  : 0}
                %
              </p>
              <p className="text-[11px] text-amber-200/50">Aproveitamento</p>
            </div>
          </div>

        </GameCard>
      </div>

      {/* Bônus raciais */}

    </div>
  );
}
