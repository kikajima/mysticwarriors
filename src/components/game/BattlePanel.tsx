'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ENEMIES, BATTLE_ENERGY_COST, npcCombatPower } from '@/lib/game/constants';
import { useServerNow } from '@/lib/game/clock';
import type { PlayerView, WorldBossView } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { BossSkeleton, fetchPanelJson, LoadFail } from './PanelLoad';
import { getPowerScale, scaleDiffLabel } from '@/lib/game/powerScale';
import { HpRecovery } from './HpRecovery';
import { PublicPlayerIdentity } from './PublicPlayerIdentity';
import { PublicPlayerProfileDialog } from './PublicPlayerProfileDialog';
import { BOSS_ATTACK_ENERGY_COST } from '@/lib/game/rules';
import { Crosshair, Heart, Shield, Swords, Skull, Timer, Zap } from 'lucide-react';

/** Poder de scouter do oponente — fonte ÚNICA compartilhada com a engine
 * (Armadura de Escala, regra 5.1): o que o card mostra é o que o duelo usa. */
const enemyPower = npcCombatPower;

const ENEMY_TIER_ROMAN = ['I', 'II', 'III'] as const;

function enemyScaleLabel(scaleName: string, tier: 1 | 2 | 3): string {
  const short = scaleName
    .replace('Mortal Comum', 'Mortal')
    .replace('Super-Humana', 'Super-Humano')
    .replace('Guerreiro Planetário', 'Planetário')
    .replace('Guerreiro Estelar', 'Estelar')
    .replace('Guerreiro Galáctico', 'Galáctico')
    .replace('Guerreiro Cósmico', 'Cósmico');
  return `${short} ${ENEMY_TIER_ROMAN[tier - 1]}`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'encerrado';
  const totalSec = Math.ceil(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function BattlePanel({
  player,
  onBattle,
  onBossAttack,
  busy,
}: {
  player: PlayerView;
  onBattle: (enemyId: string) => void;
  onBossAttack: () => Promise<boolean>;
  busy: boolean;
}) {
  const tooHurt = player.hp < Math.max(20, Math.floor(player.derived.maxHp * 0.2));
  // v0.16 — matriz de ocupação: trabalho bloqueia SÓ o PvE (o torneio e o
  // treino bloqueiam nos próprios painéis). Ameaça Universal segue liberada.
  const onMission = !!player.activeMission;
  // v0.6 — batalhas gastam energia (3 por luta)
  const noEnergy = player.energy < BATTLE_ENERGY_COST;

  return (
    <div className="space-y-6">
      <SectionTitle icon="⚔️">Arena de Batalha</SectionTitle>

      {/* Ameaça Universal */}
      <WorldBossSection player={player} onAttack={onBossAttack} busy={busy} />

      {tooHurt && (
        <GameCard className="p-4 ring-1 ring-red-500/40">
          <div className="flex items-center gap-3">
            <Heart className="w-6 h-6 text-red-400 shrink-0" />
            <div>
              <p className="font-heading text-red-200 text-sm">Vida baixa para lutar</p>
              <p className="text-xs text-amber-200/50">
                Aguarde a regeneração natural ou use um item de cura do inventário.
              </p>
              <HpRecovery player={player} />
            </div>
          </div>
        </GameCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ENEMIES.map((enemy) => {
          const power = enemyPower(enemy);
          const scale = getPowerScale(power).scale;
          const recommended = player.level >= enemy.level - 2 && player.level <= enemy.level + 5;
          const hard = player.level < enemy.level - 2;
          return (
            <GameCard key={enemy.id} className="overflow-hidden" interactive>
              <div className={`bg-gradient-to-br ${enemy.color} p-4 relative`}>
                <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                  <Chip className="bg-black/40 text-white border-white/20">Nv {enemy.level}</Chip>
                  <Chip className="bg-black/55 text-amber-100 border-amber-300/25">
                    {enemyScaleLabel(scale.nome, enemy.tier)}
                  </Chip>
                </div>
                <div className="text-5xl mb-2 drop-shadow-lg" aria-hidden>
                  {enemy.emoji}
                </div>
                <h3 className="font-heading text-white text-lg leading-tight drop-shadow pr-24">{enemy.name}</h3>
                <p className="text-white/70 text-xs italic mt-1">{enemy.taunt}</p>
                <p className="text-white/85 text-[11px] mt-2 leading-relaxed">
                  <span className="font-heading text-amber-100">Intenção:</span> {enemy.intent}
                </p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-4 gap-1 mb-3 text-center">
                  <div>
                    <p className="text-[10px] text-amber-200/40 uppercase flex justify-center items-center gap-0.5">
                      <Swords className="w-3 h-3" /> FOR
                    </p>
                    <p className="font-heading text-sm text-orange-400">{enemy.strength}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-amber-200/40 uppercase flex justify-center items-center gap-0.5">
                      <Shield className="w-3 h-3" /> DEF
                    </p>
                    <p className="font-heading text-sm text-emerald-400">{enemy.defense}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-amber-200/40 uppercase">VEL</p>
                    <p className="font-heading text-sm text-amber-300">{enemy.speed}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-amber-200/40 uppercase">KI</p>
                    <p className="font-heading text-sm text-rose-400">{enemy.ki}</p>
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  <Chip className="bg-yellow-950/40 text-yellow-300 border-yellow-800/50 flex-1 justify-center">
                    💰 {enemy.zeniReward.toLocaleString('pt-BR')}
                  </Chip>
                  <Chip className="bg-orange-950/40 text-orange-300 border-orange-800/50 flex-1 justify-center">
                    ⭐ {enemy.xpReward.toLocaleString('pt-BR')}
                  </Chip>
                  <Chip className="bg-amber-950/40 text-amber-200 border-amber-800/50 justify-center">
                    <Zap className="w-3 h-3" /> {BATTLE_ENERGY_COST}
                  </Chip>
                </div>
                {/* Escala de Poder do oponente vs a sua (ASCENSÃO Z — regra 5.1) */}
                <div
                  className="flex flex-wrap items-center justify-center gap-2 mb-3"
                  title={`Poder de luta do oponente: ${power.toLocaleString('pt-BR')}`}
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-heading ${scale.badge}`}
                  >
                    <span aria-hidden>{scale.emoji}</span>
                    {enemyScaleLabel(scale.nome, enemy.tier)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${scaleDiffLabel(power, player.derived.power).className}`}
                  >
                    {scaleDiffLabel(power, player.derived.power).text}
                  </span>

                </div>
                {recommended && (
                  <p className="text-[11px] text-emerald-300/80 mb-2 text-center">✓ Nível ideal para você</p>
                )}
                {hard && (
                  <p className="text-[11px] text-red-400/80 mb-2 text-center">⚠ Perigoso — muito acima do seu nível</p>
                )}
                <GameButton
                  variant="danger"
                  className="w-full"
                  onClick={() => onBattle(enemy.id)}
                  disabled={busy || tooHurt || onMission || noEnergy}
                  title={
                    onMission
                      ? 'Aguarde o fim do turno de trabalho'
                      : noEnergy
                        ? `Precisa de ${BATTLE_ENERGY_COST} de energia`
                        : undefined
                  }
                >
                  <Crosshair className="w-4 h-4" />
                  {tooHurt ? 'Recupere-se primeiro' : onMission ? 'EM TURNO' : noEnergy ? 'Sem energia' : 'Lutar!'}
                </GameButton>

              </div>
            </GameCard>
          );
        })}
      </div>
    </div>
  );
}

// ===== AMEAÇA UNIVERSAL =====

function WorldBossSection({
  player,
  onAttack,
  busy,
}: {
  player: PlayerView;
  onAttack: () => Promise<boolean>;
  busy: boolean;
}) {
  const [boss, setBoss] = useState<WorldBossView | null>(null);
  const [loading, setLoading] = useState(true);
  // v0.9.24 (B1): falha → estado amigável + retry (timeout 8s) — antes o
  // card da ameaça simplesmente DESAPARECIA em caso de erro
  const [failed, setFailed] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  // v0.9.11 — relógio do SERVIDOR (offset sincronizado a cada resposta de
  // ação/estado): a contagem do cooldown nunca ganha "segundos fantasmas"
  // (ex.: 62s num cooldown de 60s) por relógio local atrasado, e nunca diz
  // "pronto" antes do servidor (ceil no formatCountdown).
  const now = useServerNow(250);

  const loadSequence = useRef(0);
  const loadInFlight = useRef(false);
  const load = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    const sequence = ++loadSequence.current;
    setFailed(false);
    try {
      const res = await fetchPanelJson(`/api/game/worldboss?playerId=${player.id}`);
      if (!res.ok) throw new Error('Falha ao carregar a Ameaça Universal');
      const data = await res.json();
      const nextBoss = data.boss as WorldBossView | null;
      if (sequence === loadSequence.current) setBoss(nextBoss);
    } catch {
      // v0.9.24 (B1): sem card na tela ainda → erro amigável; refresh
      // silencioso com card antigo continua valendo
      if (sequence === loadSequence.current) setFailed(true);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
      loadInFlight.current = false;
    }
  }, [player.id]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => { ++loadSequence.current; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);

  if (loading) {
    return <BossSkeleton />;
  }

  if (failed && !boss) {
    return (
      <LoadFail
        what="A ameaça universal"
        onRetry={() => void load()}
      />
    );
  }

  if (!boss || Date.parse(boss.endsAt) <= now) return null;

  const hpPct = Math.max(0, (boss.currentHp / boss.maxHp) * 100);
  const timeLeft = new Date(boss.endsAt).getTime() - now;
  const cooldownLeft = boss.canAttackAt ? new Date(boss.canAttackAt).getTime() - now : 0;
  const onCooldown = cooldownLeft > 0;

  return (
    <GameCard glow className="p-5 sm:p-6 relative overflow-hidden border-red-800/50">
      <div
        className="absolute inset-0 bg-gradient-to-br from-red-950/60 via-transparent to-purple-950/40 pointer-events-none"
        aria-hidden
      />
      <div className="relative">
        {/* Cabeçalho */}
        <div className="flex items-center gap-2 mb-4">
          <Skull className="w-5 h-5 text-red-400" />
          <h3 className="font-display text-xl sm:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-purple-400 tracking-widest">
            AMEAÇA UNIVERSAL
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-5">
          {/* Boss */}
          <div className="text-center shrink-0">
            <div className="text-6xl sm:text-7xl drop-shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse" aria-hidden>
              {boss.emoji}
            </div>
            <p className="font-heading text-amber-100 text-lg mt-1">{boss.name}</p>
            <p className="text-[11px] text-red-300/70">Nível {boss.level}</p>
            {/* v0.9.12 — Escala de Poder da ameaça (regra 5.1 visível) */}
            <div
              className="mt-2 flex flex-col items-center gap-1"
              title={`Poder de luta: ${boss.power.toLocaleString('pt-BR')}`}
            >
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-heading ${getPowerScale(boss.power).scale.badge}`}
              >
                <span aria-hidden>{getPowerScale(boss.power).scale.emoji}</span>
                {getPowerScale(boss.power).scale.nome}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${scaleDiffLabel(boss.power, player.derived.power).className}`}
              >
                {scaleDiffLabel(boss.power, player.derived.power).text}
              </span>
            </div>
          </div>

          {/* HP global */}
          <div className="flex-1 w-full min-w-0">
            <div className="flex justify-between text-xs font-heading mb-1">
              <span className="text-red-300">HP GLOBAL</span>
              <span className="text-amber-200/80 tabular-nums">
                {boss.currentHp.toLocaleString('pt-BR')} / {boss.maxHp.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="h-5 bg-black/60 rounded-full overflow-hidden border-2 border-red-900/60">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-purple-500 rounded-full transition-all duration-700"
                style={{ width: `${hpPct}%` }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
              <div className="bg-black/40 rounded-lg py-1.5">
                <p className="text-[9px] uppercase text-amber-200/40 tracking-wide">Tempo restante</p>
                <p className="font-heading text-sm text-amber-200 flex items-center justify-center gap-1">
                  <Timer className="w-3 h-3" /> {formatCountdown(timeLeft)}
                </p>
              </div>
              <div className="bg-black/40 rounded-lg py-1.5">
                <p className="text-[9px] uppercase text-amber-200/40 tracking-wide">Seu dano</p>
                <p className="font-heading text-sm text-orange-400">{boss.myDamage.toLocaleString('pt-BR')}</p>
              </div>
              <div className="bg-black/40 rounded-lg py-1.5">
                <p className="text-[9px] uppercase text-amber-200/40 tracking-wide">Sua posição</p>
                <p className="font-heading text-sm text-yellow-400">
                  {boss.myPosition ? `${boss.myPosition}º` : '—'}
                </p>
              </div>
              <div className="bg-black/40 rounded-lg py-1.5">
                <p className="text-[9px] uppercase text-amber-200/40 tracking-wide">Guerreiros</p>
                <p className="font-heading text-sm text-amber-200">{boss.totalAttackers}</p>
              </div>
            </div>

          </div>
        </div>

        {/* Top damage */}
        {boss.topDamage.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest text-amber-200/40 font-heading mb-1.5">
              Maiores danos
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {boss.topDamage.slice(0, 6).map((d, i) => (
                <div
                  key={d.id ?? `${d.name}:${i}`}
                  className={`flex items-center gap-2 rounded-xl border p-2 ${
                    d.isMe
                      ? 'border-orange-600/60 bg-orange-950/35'
                      : 'border-amber-900/40 bg-black/25'
                  }`}
                >
                  <span className="w-7 shrink-0 text-center font-heading text-amber-300">{i + 1}º</span>
                  <div className="min-w-0 flex-1">
                    <PublicPlayerIdentity
                      name={d.name}
                      race={d.race ?? 'humano'}
                      avatarUrl={d.avatarUrl}
                      cosmetics={d.cosmetics}
                      compact
                      onClick={d.id ? () => setProfileId(d.id!) : undefined}
                    />
                  </div>
                  <span className="shrink-0 font-heading text-xs text-red-300">
                    {d.damage.toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ação */}
        <div className="mt-4 flex justify-center">
          <GameButton
            size="lg"
            variant="danger"
            disabled={busy || onCooldown || player.energy < BOSS_ATTACK_ENERGY_COST || player.hp < Math.max(20, Math.floor(player.derived.maxHp * 0.3))}
            onClick={async () => {
              if (await onAttack()) {
                await load();
              }
            }}
          >
            <Zap className="w-5 h-5" />
            {onCooldown
              ? `Recarregando... ${formatCountdown(cooldownLeft)}`
              : player.energy < BOSS_ATTACK_ENERGY_COST
              ? `Sem energia (${BOSS_ATTACK_ENERGY_COST})`
              : 'ATACAR A AMEAÇA'}
          </GameButton>
        </div>
      </div>
      <PublicPlayerProfileDialog playerId={profileId} onOpenChange={(open) => !open && setProfileId(null)} />
    </GameCard>
  );
}
