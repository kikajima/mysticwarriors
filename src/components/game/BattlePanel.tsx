'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ENEMIES, getStrategy, getTalent, BATTLE_ENERGY_COST, npcCombatPower } from '@/lib/game/constants';
import { useServerNow } from '@/lib/game/clock';
import type { PlayerView, WorldBossView } from '@/lib/game/types';
import { Chip, GameButton, GameCard, SectionTitle } from './Bits';
import { BossSkeleton, fetchPanelJson, LoadFail } from './PanelLoad';
import { loadCloudWorldBoss, saveCloudWorldBoss, type CloudWorldBossSnapshot } from '@/lib/supabase/client';
import { getPowerScale, scaleDiffLabel, scaleCombatRules } from '@/lib/game/powerScale';
import { IMPETO } from '@/lib/game/impeto';
import { Crosshair, Flame, Heart, Hospital, Shield, Swords, Skull, Timer, Loader2, Zap } from 'lucide-react';

/** Poder de scouter do oponente — fonte ÚNICA compartilhada com a engine
 * (Armadura de Escala, regra 5.1): o que o card mostra é o que o duelo usa. */
const enemyPower = npcCombatPower;

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
  onHeal,
  onBossAttack,
  busy,
}: {
  player: PlayerView;
  onBattle: (enemyId: string) => void;
  onHeal: () => void;
  onBossAttack: () => Promise<boolean>;
  busy: boolean;
}) {
  const hpPct = Math.round((player.hp / player.derived.maxHp) * 100);
  const tooHurt = player.hp < Math.max(20, Math.floor(player.derived.maxHp * 0.2));
  const healCost = (player.derived.maxHp - player.hp) * 3;
  const strategy = getStrategy(player.strategy);
  // v0.16 — matriz de ocupação: trabalho bloqueia SÓ o PvE (o torneio e o
  // treino bloqueiam nos próprios painéis). Ameaça Universal e HOSPITAL seguem
  // liberados durante o turno — só os 3 negados têm mensagem clara.
  const onMission = !!player.activeMission;
  // v0.6 — batalhas gastam energia (3 por luta)
  const noEnergy = player.energy < BATTLE_ENERGY_COST;

  return (
    <div className="space-y-6">
      <SectionTitle icon="⚔️">Arena de Batalha</SectionTitle>

      {/* Ameaça Universal */}
      <WorldBossSection player={player} onAttack={onBossAttack} busy={busy} />

      {/* Hospital */}
      <GameCard className={`p-4 ${tooHurt ? 'ring-1 ring-red-500/50' : ''}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Hospital className="w-8 h-8 text-red-400 shrink-0" />
            <div>
              <h3 className="font-heading text-amber-100 flex items-center gap-2 flex-wrap">
                Hospital do Doutor Brief
              </h3>
              <p className="text-xs text-amber-200/50">
                Vida atual:{' '}
                <span className={tooHurt ? 'text-red-400 font-heading' : 'text-emerald-400 font-heading'}>
                  {player.hp}/{player.derived.maxHp} ({hpPct}%)
                </span>
                {tooHurt && <span className="text-red-400"> — você está ferido demais para lutar!</span>}
                {player.hp < player.derived.maxHp && (
                  <span className="text-amber-200/40"> · cura: {healCost.toLocaleString('pt-BR')} Zeni</span>
                )}
              </p>
            </div>
          </div>
          <GameButton
            variant="danger"
            onClick={onHeal}
            disabled={busy || player.hp >= player.derived.maxHp || player.zeni < healCost}
            title="Cura disponível mesmo durante o trabalho (hospital nunca é bloqueado)"
          >
            <Heart className="w-4 h-4" />
            {player.hp >= player.derived.maxHp
              ? 'Totalmente curado'
              : `Curar por ${healCost.toLocaleString('pt-BR')} Zeni`}
          </GameButton>
        </div>
      </GameCard>

      {false && <GameCard className="p-4">
        <p className="text-sm text-amber-200/70 leading-relaxed">
          Desafie vilões lendários em batalhas turno a turno. Cada batalha consome{' '}
          <span className="text-amber-300 font-heading">{BATTLE_ENERGY_COST} de energia</span> (recarrega com o
          tempo — cerca de 5 minutos por ponto). Ataques <span className="text-orange-400">físicos</span> escalam de{' '}
          <span className="text-orange-300">Força</span>; ataques de <span className="text-rose-400">energia</span>{' '}
          escalam de <span className="text-rose-300">Ki</span> e consomem Ki de batalha. Sua estratégia atual:{' '}
          <span className="text-amber-100">
            {strategy.icon} {strategy.name}
          </span>{' '}
          (mude na aba Treino).
        </p>
        <div className="flex items-center gap-2 mt-3 text-xs text-amber-200/60">
          <Zap className="w-4 h-4 text-amber-400" /> Energia atual:{' '}
          <span className={`font-heading ${noEnergy ? 'text-red-400' : 'text-amber-300'}`}>
            {player.energy}/{player.derived.maxEnergy}
          </span>
        </div>
      </GameCard>}

      {false && <GameCard className="p-4 border-orange-900/40">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-600/20 border border-orange-700/40 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-400" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-heading text-amber-100 flex items-center gap-2 flex-wrap">
              Ímpeto
              <span className="text-[10px] font-normal text-amber-200/50 border border-amber-800/40 rounded-full px-2 py-0">
                ASCENSÃO Z — Cap. 7
              </span>
            </h3>
            <p className="text-xs text-amber-200/70 leading-relaxed mt-1">
              O combate gera <span className="text-orange-300 font-heading">Ímpeto</span> (máx.{' '}
              {IMPETO.max}): golpes pesados recebidos, críticos de Abertura e a metade da vida perdida acendem a
              chama. Gasto automático no duelo:{' '}
              <span className="text-amber-100">1</span> estende o combo (golpe extra),{' '}
              <span className="text-cyan-300">2</span> ativam a Defesa Heroica (impacto pela metade) e{' '}
              <span className="text-yellow-300">3</span> disparam a{' '}
              <span className="text-yellow-300 font-heading">Quebra de Limite</span>: +1 Escala por 2 rodadas
              quando a vida cai abaixo da metade (Cap. 29 — 1× por combate). Depois vem o preço:{' '}
              <span className="text-teal-300">💧 2 rodadas de Exaustão</span> — golpes{' '}
              <span className="text-teal-300">−15%</span>, dano recebido{' '}
              <span className="text-teal-300">+10%</span> (Cap. 29: o milagre cobra caro). Mas quem domina o
              talento{' '}
              <span className="text-sky-300">🌬️ Segundo Vento</span> intercepta a fadiga no instante em que
              ela ia entrar — <span className="text-sky-300">2 Ímpetos</span> e o milagre fica completo, sem preço.
            </p>
            <p className="text-[11px] text-amber-200/50 mt-2 leading-relaxed">
              <span className="text-orange-300">🔥 Espírito de Superação:</span> enfrentar um oponente ≥1 escala
              acima dá <span className="text-orange-300">+1 Ímpeto</span> no início — a chama dos azarões. Estratégia
              <span className="text-amber-100"> {strategy.icon} {strategy.name}</span> define a avidez por combos
              (mude na aba Treino).
            </p>
            {/* v0.9.15 — talentos dominados: badges de talento no card de Ímpeto */}
            {(player.talents?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {player.talents.map((tid) => {
                  const t = getTalent(tid);
                  if (!t) return null;
                  return (
                    <span
                      key={tid}
                      title={t.effect}
                      className="inline-flex items-center gap-1 text-[10px] font-heading px-2 py-0.5 rounded-full border border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
                    >
                      {t.icon} {t.name}
                    </span>
                  );
                })}
              </div>
            )}
            {(player.talents?.length ?? 0) === 0 && (
              <p className="text-[10px] text-amber-200/40 mt-2.5 leading-snug">
                🎯 <span className="text-emerald-300/80">Talentos de Ímpeto</span> (Cap. 7) desbloqueiam gastos
                extras de Ímpeto — repertório de acerto, esquiva e até o cancelamento da Exaustão. Disponíveis na{' '}
                <span className="text-amber-200/70">Loja → Talentos</span>.
              </p>
            )}
          </div>
        </div>
      </GameCard>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ENEMIES.map((enemy) => {
          const recommended = player.level >= enemy.level - 2 && player.level <= enemy.level + 5;
          const hard = player.level < enemy.level - 2;
          return (
            <GameCard key={enemy.id} className="overflow-hidden" interactive>
              <div className={`bg-gradient-to-br ${enemy.color} p-4 relative`}>
                <div className="absolute top-3 right-3">
                  <Chip className="bg-black/40 text-white border-white/20">Nv {enemy.level}</Chip>
                </div>
                <div className="text-5xl mb-2 drop-shadow-lg" aria-hidden>
                  {enemy.emoji}
                </div>
                <h3 className="font-heading text-white text-lg leading-tight drop-shadow">{enemy.name}</h3>
                <p className="text-white/70 text-xs italic mt-1">{enemy.taunt}</p>
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
                  title={`Poder de luta do oponente: ${enemyPower(enemy).toLocaleString('pt-BR')}`}
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-heading ${getPowerScale(enemyPower(enemy)).scale.badge}`}
                  >
                    <span aria-hidden>{getPowerScale(enemyPower(enemy)).scale.emoji}</span>
                    {getPowerScale(enemyPower(enemy)).scale.nome}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${scaleDiffLabel(enemyPower(enemy), player.derived.power).className}`}
                  >
                    {scaleDiffLabel(enemyPower(enemy), player.derived.power).text}
                  </span>
                  {/* v0.9.13 — Espírito de Superação (Cap. 7): o azarão
                      começa o duelo com +1 Ímpeto (badge informativo) */}
                  {scaleCombatRules(player.derived.power, enemyPower(enemy)).diff >= 1 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-orange-300 border-orange-700/60 bg-orange-950/50"
                      title="Espírito de Superação: começar abaixo na Escala de Poder dá +1 Ímpeto no início do combate."
                    >
                      <Flame className="w-3 h-3" aria-hidden /> +1 Ímpeto de superação
                    </span>
                  )}
                  {/* v0.9.12 — Armadura de Escala: o que a regra 5.1/5.3 fará
                      com o SEU dano neste duelo (informação antes de lutar) */}
                  {(() => {
                    const rules = scaleCombatRules(player.derived.power, enemyPower(enemy));
                    if (rules.crushing) {
                      return (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-rose-300 border-rose-800/60 bg-rose-950/50"
                          title="Regra 5.3: golpes do azarão são esmagados; críticos geram Aberturas e 3 delas rompem a barreira numa técnica."
                        >
                          💥 escala esmagadora — crie Aberturas!
                        </span>
                      );
                    }
                    if (rules.armor > 0) {
                      return (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-sky-300 border-sky-800/60 bg-sky-950/50"
                          title="Regra 5.1: seu dano é reduzido pela Armadura de Escala do oponente."
                        >
                          🛡️ Armadura de Escala {rules.armor} contra você
                        </span>
                      );
                    }
                    if (rules.advantage > 0) {
                      return (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-amber-300 border-amber-700/60 bg-amber-950/50"
                          title="Regra 5.1: você causa dano adicional por escala de vantagem."
                        >
                          ⚔️ +{Math.round(rules.damageMult * 100 - 100)}% de dano
                        </span>
                      );
                    }
                    return null;
                  })()}
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
                      ? 'Treinos, lutas contra inimigos e torneio esperam o fim do turno de trabalho'
                      : noEnergy
                        ? `Precisa de ${BATTLE_ENERGY_COST} de energia (recarrega com o tempo)`
                        : undefined
                  }
                >
                  <Crosshair className="w-4 h-4" />
                  {tooHurt ? 'Cure-se primeiro' : onMission ? 'EM TURNO' : noEnergy ? 'Sem energia' : 'Lutar!'}
                </GameButton>
                {onMission && (
                  <p className="text-[10px] text-orange-300/70 mt-1.5 text-center">
                    ⚠️ Em turno de trabalho — lutas contra inimigos esperam o retorno (PvP, Ameaça Universal, loja, guilda e hospital seguem liberados).
                  </p>
                )}
                {!onMission && noEnergy && !tooHurt && (
                  <p className="text-[10px] text-amber-300/70 mt-1.5 text-center">
                    ⚡ Cada batalha custa {BATTLE_ENERGY_COST} de energia — aguarde recarregar (~5 min/ponto).
                  </p>
                )}
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
  // v0.9.11 — relógio do SERVIDOR (offset sincronizado a cada resposta de
  // ação/estado): a contagem do cooldown nunca ganha "segundos fantasmas"
  // (ex.: 62s num cooldown de 60s) por relógio local atrasado, e nunca diz
  // "pronto" antes do servidor (ceil no formatCountdown).
  const now = useServerNow(250);

  const loadSequence = useRef(0);
  const loadInFlight = useRef(false);
  const restoreAttempted = useRef(false);
  const load = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    const sequence = ++loadSequence.current;
    setFailed(false);
    try {
      const res = await fetchPanelJson(`/api/game/worldboss?playerId=${player.id}`);
      const data = await res.json();
      let nextBoss = data.boss as WorldBossView | null;
      const cloud = await loadCloudWorldBoss();
      if (nextBoss && cloud && cloud.id === nextBoss.id) {
        // O SQLite pode ter acabado de nascer após um deploy. O snapshot
        // global do Supabase é a fonte durável do HP, prazo e ranking.
        if (!restoreAttempted.current) {
          restoreAttempted.current = true;
          await fetch('/api/game/worldboss-cloud', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cloud),
          });
        }
        const cloudDamage = [...cloud.damages].sort((a, b) => b.damage - a.damage);
        const mine = cloud.damages.find((d) => d.playerId === player.id);
        const myPosition = mine ? cloudDamage.findIndex((d) => d.playerId === player.id) + 1 : null;
        nextBoss = {
          ...nextBoss,
          currentHp: cloud.currentHp,
          endsAt: cloud.endsAt,
          myDamage: mine?.damage ?? nextBoss.myDamage,
          myPosition,
          totalAttackers: cloud.damages.length,
          topDamage: cloudDamage.slice(0, 10).map((d) => ({ name: d.name, damage: d.damage, isMe: d.playerId === player.id })),
        };
      }
      if (nextBoss && !cloud && !restoreAttempted.current) {
        restoreAttempted.current = true;
        void saveLocalBossToCloud();
      }
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
  const saveLocalBossToCloud = useCallback(async () => {
    const localRes = await fetch('/api/game/worldboss-cloud');
    const localData = await localRes.json();
    const local = localData.snapshot as CloudWorldBossSnapshot | null;
    if (!local) return;
    const previous = await loadCloudWorldBoss();
    if (previous && previous.id === local.id) {
      const merged = new Map(previous.damages.map((d) => [d.playerId, d]));
      for (const damage of local.damages) merged.set(damage.playerId, damage);
      local.damages = [...merged.values()];
    }
    await saveCloudWorldBoss(local);
  }, []);

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

  if (!boss) return null;

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
              title={`Poder de luta: ${boss.power.toLocaleString('pt-BR')} — a Armadura de Escala (5.1) reduz o dano de quem está abaixo.`}
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

            <p className="text-[11px] text-amber-200/40 mt-2 leading-snug">
              {boss.description}
            </p>
          </div>
        </div>

        {/* Top damage */}
        {boss.topDamage.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest text-amber-200/40 font-heading mb-1.5">
              Maiores danos
            </p>
            <div className="flex flex-wrap gap-1.5">
              {boss.topDamage.slice(0, 5).map((d, i) => (
                <Chip
                  key={i}
                  className={
                    d.isMe
                      ? 'bg-orange-900/60 text-orange-300 border-orange-600/60'
                      : 'bg-black/40 text-amber-200/70 border-amber-900/50'
                  }
                >
                  {i + 1}º {d.name}: {d.damage.toLocaleString('pt-BR')}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Ação */}
        <div className="mt-4 flex justify-center">
          <GameButton
            size="lg"
            variant="danger"
            disabled={busy || onCooldown || player.energy < 10 || player.hp < Math.max(20, Math.floor(player.derived.maxHp * 0.3))}
            onClick={async () => {
              if (await onAttack()) {
                await load();
                await saveLocalBossToCloud();
              }
            }}
          >
            <Zap className="w-5 h-5" />
            {onCooldown
              ? `Recarregando... ${formatCountdown(cooldownLeft)}`
              : player.energy < 10
              ? 'Sem energia (precisa 10)'
              : 'ATACAR A AMEAÇA'}
          </GameButton>
        </div>
      </div>
    </GameCard>
  );
}
