'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '@/hooks/use-toast';
import type { AccountSession } from '@/lib/auth';
import type { ActivityView, BattleResult, PlayerNotificationView, PlayerView } from '@/lib/game/types';
import { AuthGate } from '@/components/game/AuthGate';
import { CharacterCreate } from '@/components/game/CharacterCreate';
import { CharacterSelect } from '@/components/game/CharacterSelect';
import { Dashboard } from '@/components/game/Dashboard';
import { TrainingPanel } from '@/components/game/TrainingPanel';
import { ProfessionsPanel } from '@/components/game/ProfessionsPanel';
import { InventoryPanel } from '@/components/game/InventoryPanel';
import { BattlePanel } from '@/components/game/BattlePanel';
import { BattleLogDialog } from '@/components/game/BattleLogDialog';
import { TournamentPanel } from '@/components/game/TournamentPanel';
import { ShopPanel } from '@/components/game/ShopPanel';
import { MarketPanel } from '@/components/game/MarketPanel';
import { RankingPanel } from '@/components/game/RankingPanel';
import { ShenronPanel } from '@/components/game/ShenronPanel';
import { GuildsPanel } from '@/components/game/GuildsPanel';
import { AchievementsPanel, type ClaimableAchievement } from '@/components/game/AchievementsPanel';
import { PlayerAvatar, GameButton } from '@/components/game/Bits';
import {
  applyOptimisticDelta,
  builtinOptimisticDelta,
  optimisticLevelsGained,
  type OptimisticDelta,
} from '@/lib/game/optimistic';
import { WikiIconLink } from '@/components/game/WikiIconLink';
import { SaveWarriorDialog } from '@/components/game/SaveWarriorDialog';
import { AvatarDialog } from '@/components/game/AvatarDialog';
import { ChatWidget } from '@/components/ChatWidget';
import { equippedCosmetic } from '@/lib/game/content/cosmetics';
import { noteServerTime, serverNowMs } from '@/lib/game/clock';
import { projectPlayerRegen } from '@/lib/game/clientRegen';
import {
  getSupabaseSession,
  loadCloudProfile,
  loadCloudCharacters,
  ensureCloudProfileNick,
  upsertCloudCharacters,
  deleteStaleCloudCharacters,
  supabaseSignOut,
  supabaseIsAdmin,
} from '@/lib/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  LayoutDashboard,
  Dumbbell,
  Briefcase,
  Swords,
  Store,
  Handshake,
  Trophy,
  Sparkle,
  Users,
  Medal,
  MoreVertical,
  LogOut,
  Repeat,
  Menu,
  Award,
  Save,
  CloudOff,
  RotateCw,
  Backpack,
} from 'lucide-react';

type View =
  | 'dashboard'
  | 'training'
  | 'missions'
  | 'inventory'
  | 'battle'
  | 'tournament'
  | 'shop'
  | 'market'
  | 'ranking'
  | 'guilds'
  | 'shenron'
  | 'achievements';

const NAV: Array<{ key: View; label: string; icon: React.ReactNode; short: string }> = [
  { key: 'dashboard', label: 'Visão Geral', short: 'Início', icon: <LayoutDashboard className="w-4 h-4" /> },
  { key: 'training', label: 'Treino', short: 'Treino', icon: <Dumbbell className="w-4 h-4" /> },
  { key: 'missions', label: 'Atividades', short: 'Atividades', icon: <Briefcase className="w-4 h-4" /> },
  { key: 'inventory', label: 'Inventário', short: 'Itens', icon: <Backpack className="w-4 h-4" /> },
  { key: 'battle', label: 'Batalha', short: 'Lutar', icon: <Swords className="w-4 h-4" /> },
  { key: 'tournament', label: 'Torneio', short: 'Torneio', icon: <Medal className="w-4 h-4" /> },
  { key: 'shop', label: 'Loja', short: 'Loja', icon: <Store className="w-4 h-4" /> },
  { key: 'market', label: 'Mercado', short: 'Mercado', icon: <Handshake className="w-4 h-4" /> },
  { key: 'ranking', label: 'Ranking', short: 'Ranking', icon: <Trophy className="w-4 h-4" /> },
  { key: 'guilds', label: 'Guildas', short: 'Guildas', icon: <Users className="w-4 h-4" /> },
  { key: 'shenron', label: 'Shenlon', short: 'Shenlon', icon: <Sparkle className="w-4 h-4" /> },
  { key: 'achievements', label: 'Conquistas', short: 'Conquistas', icon: <Award className="w-4 h-4" /> },
];

/** navegação mobile (bottom): Início, Lutar, Trabalho, Treino, Mais */
const MOBILE_NAV: View[] = ['dashboard', 'battle', 'missions', 'training'];

type Screen = 'boot' | 'auth' | 'select' | 'create' | 'game';

/*
 * v0.9 — PAINEL DE ADMIN: o código fica em um bundle SEPARADO, buscado
 * pelo navegador apenas quando a RPC is_admin() (Supabase) confirma que
 * a conta logada é a administradora. Para todos os outros usuários o
 * componente nunca é carregado, o atalho F2 não é registrado e nenhum
 * botão/menção aparece — não é "escondido", não existe.
 */
const AdminPanel = dynamic(() => import('@/components/game/AdminPanel').then((m) => m.AdminPanel), {
  ssr: false,
});

/** Efeito de tela cheia do cosmético equipado (teleporte/onda de Ki). */
function ScreenEffect({ effect }: { effect: 'teleport' | 'kiwave' }) {
  const [play, setPlay] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setPlay(false), 1700);
    return () => clearTimeout(t);
  }, []);
  if (!play) return null;
  if (effect === 'teleport') {
    return (
      <div
        className="fixed inset-0 z-[90] pointer-events-none"
        aria-hidden
        style={{
          animation: 'fx-teleport 0.9s ease-out forwards',
          background:
            'radial-gradient(circle at 50% 42%, rgba(56,189,248,0.8), rgba(14,116,144,0.4) 45%, transparent 72%)',
        }}
      />
    );
  }
  return (
    <div
      className="fixed inset-y-0 left-0 w-3/5 z-[90] pointer-events-none"
      aria-hidden
      style={{
        animation: 'fx-kiwave 1.4s ease-in-out forwards',
        background:
          'linear-gradient(90deg, transparent, rgba(52,211,153,0.35), rgba(251,191,36,0.5), transparent)',
      }}
    />
  );
}

export default function PlayPage() {
  const [screen, setScreen] = useState<Screen>('boot');
  // playerId vive APENAS em memória React — nunca em localStorage.
  // No boot ele vem do SERVIDOR (account.activePlayerId via /api/auth/session).
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerView | null>(null);
  const [view, setView] = useState<View>('dashboard');
  const [busy, setBusy] = useState(false);
  const [guildInvites, setGuildInvites] = useState(0);
  const [guildMotd, setGuildMotd] = useState('');
  const [battle, setBattle] = useState<BattleResult | null>(null);
  const [auth, setAuth] = useState<AccountSession | null>(null);
  const [characters, setCharacters] = useState<PlayerView[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  // atividade iniciada LOCALMENTE (enquanto anima); a fonte da verdade do
  // estado (pós-reload) é player.runningActivity, devolvida pelo servidor
  const [localActivity, setLocalActivity] = useState<ActivityView | null>(null);
  const { toast } = useToast();
  const retryRef = useRef(false);
  // guard: troca de avatar recente não pode ser desfeita por polling atrasado
  const avatarTouchedRef = useRef<{ url: string | null; at: number } | null>(null);
  // v0.5 — CORREÇÃO DA BATALHA DUPLICADA: atividades cuja batalha JÁ foi
  // exibida ao jogador (na resposta da ação OU retomada pós-reload). Quando
  // o resultado aplicado chega depois (pendingResults/appliedResults), a
  // batalha NÃO é re-exibida — era isto que "resetava" a animação no meio
  // e fazia a luta rodar duas vezes.
  const shownActivityIdsRef = useRef<Set<string>>(new Set());
  // Notificações persistentes podem aparecer em respostas concorrentes
  // (/state e sync_activity). Este set evita pop-up duplicado enquanto a
  // confirmação ao servidor ainda está em voo.
  const shownNotificationIdsRef = useRef<Set<string>>(new Set());
  // ===== v0.8 — sincronização com a nuvem (Supabase) =====
  // fingerprint do último estado salvo em profiles.progresso
  const lastSavedCloudRef = useRef<string | null>(null);
  const lastImportantRef = useRef<string | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  const cloudSaveInFlightRef = useRef(false);
  // v0.9.20 — coleta de conquistas (UI otimista): contador de coletas em
  // andamento + último estado do servidor recebido. Com várias coletas em
  // sequência, apenas a ÚLTIMA resposta aplica o estado real — evita que a
  // verdade de uma coleta anterior apague (por um instante) o crédito
  // otimista de uma coleta posterior ainda não confirmada.
  const pendingClaimsRef = useRef(0);
  const latestClaimPlayerRef = useRef<PlayerView | null>(null);
  // ===== v0.9.21 — CORREÇÃO 2: FUNDO CONGELADO DURANTE A LUTA =====
  // Enquanto o diálogo de batalha estiver aberto, NADA do estado pós-luta
  // (HP, recompensas, avanço do torneio, cooldown do comitê) pode
  // aparecer no fundo — nem toasts de level-up. Tudo que chega do
  // servidor (término da atividade, polling de 15s) é DIFERIDO e só
  // "acorda" quando o jogador clica em "Continuar". Causa raiz: a
  // atividade expirava em ~5s enquanto o replay seguia por 14s+, e o
  // fundo atualizava no MEIO da luta (o dono viu o painel do torneio
  // já mostrando a próxima campanha com a semifinal ainda rolando).
  const battleOpenRef = useRef(false);
  const deferredPlayerRef = useRef<PlayerView | null>(null);
  const deferredToastsRef = useRef<Array<() => void>>([]);

  // Regeneração visível em tempo real. O servidor continua autoritativo,
  // mas a UI não precisa esperar a poll de 15s/F5 para mostrar um ponto de
  // energia ou vida que já venceu pelo relógio.
  useEffect(() => {
    if (screen !== 'game' || !playerId) return;
    const tick = () => {
      if (battleOpenRef.current) return; // fundo permanece congelado na luta
      setPlayer((prev) => (prev ? projectPlayerRegen(prev, serverNowMs()) : prev));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [screen, playerId]);

  // indireção estável: o boot (deps []) chama handleAuthed via ref
  const handleAuthedRef = useRef<
    (account: AccountSession, chars: PlayerView[]) => Promise<void> | void
  >(() => {});
  // ===== v0.9 — admin: a conta logada é a administradora? =====
  // A resposta vem do SUPABASE (RPC is_admin, security definer) com a
  // sessão do próprio usuário — nenhum e-mail fica embutido no jogo.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      // reexecuta também ao ENTRAR em um personagem: o painel acompanha a
      // conta administradora em qualquer guerreiro que ela esteja jogando
      void playerId;
      if (!auth || auth.isGuest) {
        if (active) setIsAdmin(false);
        return;
      }
      const session = await getSupabaseSession();
      if (!session) {
        if (active) setIsAdmin(false);
        return;
      }
      const admin = await supabaseIsAdmin();
      if (active) setIsAdmin(admin);
    })();
    return () => {
      active = false;
    };
  }, [auth?.id, auth?.isGuest, playerId]);

  // ===== Boot (v0.8): sessão local (cookie) × sessão na nuvem (Supabase) =====
  // Cenário-chave: publicação substituiu o banco local → cookie morre, mas a
  // conta Supabase segue logada no navegador → a ponte reconecta e o
  // progresso é restaurado da nuvem, sem o jogador precisar fazer nada.
  useEffect(() => {
    let active = true;
    (async () => {
      const [localData, supaSession] = await Promise.all([
        fetch('/api/auth/session', { cache: 'no-store' })
          .then((res) => res.json())
          .catch(() => null),
        getSupabaseSession(),
      ]);
      if (!active) return;

      if (localData?.account) {
        // sessão local válida → segue direto (comportamento clássico)
        setAuth(localData.account);
        const chars: PlayerView[] = localData.characters ?? [];
        setCharacters(chars);
        const activeId: string | null = localData.activePlayerId ?? null;
        const activeValid = activeId && chars.some((c) => c.id === activeId);
        if (activeValid) {
          // personagem em uso definido pelo servidor — segue direto ao jogo
          setPlayer(chars.find((c) => c.id === activeId) ?? null);
          setView('dashboard');
          setPlayerId(activeId);
          setScreen('game');
        } else {
          setScreen(chars.length > 0 ? 'select' : 'create');
        }
        return;
      }

      // sem cookie local, mas conta na nuvem logada → reconexão automática
      if (supaSession) {
        try {
          const res = await fetch('/api/auth/supabase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: supaSession.access_token }),
          });
          const bridge = await res.json();
          if (active && res.ok && bridge.success !== false) {
            await handleAuthedRef.current(bridge.account, bridge.characters ?? []);
            return;
          }
        } catch {
          // cai para a tela de login
        }
      }

      if (active) setScreen('auth');
    })();
    return () => {
      active = false;
    };
    // handleAuthedRef é estável (nunca muda de identidade)
  }, []);

  // ===== Aplica estado do personagem vindo do servidor =====
  // Guarda contra polling atrasado: uma resposta antiga NUNCA desfaz uma
  // troca de avatar feita há menos de 6s (a próxima poll já vem correta).
  // v0.9.21 (correção 2): com o diálogo de batalha aberto, o estado é
  // DIFERIDO (battleOpenRef) — o fundo só acorda no "Continuar".
  const stageIncomingBattle = useCallback((data: { activity?: ActivityView; player?: PlayerView; battle?: BattleResult; appliedResults?: Array<{ activityId?: string; battle?: BattleResult }>; pendingResults?: Array<{ activityId?: string; battle?: BattleResult }> }) => {
    const activity = data.activity ?? data.player?.runningActivity;
    if (activity?.kind === 'battle' && activity.result?.battle && !shownActivityIdsRef.current.has(activity.id)) {
      shownActivityIdsRef.current.add(activity.id);
      battleOpenRef.current = true;
      setLocalActivity(activity);
      setBattle(activity.result.battle);
    }
    const pending = [...(data.appliedResults ?? []), ...(data.pendingResults ?? [])];
    if (data.battle || pending.some(r => r.battle && (!r.activityId || !shownActivityIdsRef.current.has(r.activityId)))) battleOpenRef.current = true;
  }, []);

  const applyPlayerState = useCallback((incoming: PlayerView) => {
    if (battleOpenRef.current) {
      deferredPlayerRef.current = incoming; // congela o fundo até o resultado
      return;
    }
    const touched = avatarTouchedRef.current;
    if (touched && Date.now() - touched.at < 6000 && incoming.avatarUrl !== touched.url) {
      return; // descarta resposta obsoleta
    }
    if (touched) avatarTouchedRef.current = null;
    setPlayer(incoming);
  }, []);

  // v0.9.21 — o ref acompanha o estado do diálogo (efeito, não render)
  useEffect(() => {
    battleOpenRef.current = battle !== null;
    // fechar sem passar pelo closeBattle (ex.: troca de personagem que
    // zera o battle) também libera o fundo sem aplicar estado velho
    if (battle === null) {
      deferredPlayerRef.current = null;
      deferredToastsRef.current = [];
    }
  }, [battle]);

  // v0.9.21 — "Continuar" do diálogo de batalha: acorda o fundo com o
  // estado real acumulado durante a luta (chamado APÓS setBattle(null))
  const flushBattleDeferredState = useCallback(() => {
    battleOpenRef.current = false;
    const deferred = deferredPlayerRef.current;
    deferredPlayerRef.current = null;
    if (deferred) setPlayer(deferred);
    const toasts = deferredToastsRef.current;
    deferredToastsRef.current = [];
    for (const t of toasts) t();
  }, []);

  // ===== Exibe resultados pendentes de atividades (toasts + batalha) =====
  // v0.5: resultado de atividade JÁ EXIBIDA (mesmo activityId) não repete a
  // batalha — apenas sinaliza o level-up confirmado na aplicação.
  // v0.9.21 (correção 2): toasts gerados enquanto o diálogo de batalha está
  // aberto são DIFERIDOS (o level-up/resultado não pode vazar antes do
  // "Continuar" — faria spoiler do desfecho que a animação ainda narra).
  const showAppliedResults = useCallback(
    (results: Array<{ activityId?: string; kind: string; message: string; levelsGained: number; battle?: BattleResult }>) => {
      const emit = (fn: () => void) => {
        if (battleOpenRef.current) deferredToastsRef.current.push(fn);
        else fn();
      };
      for (const r of results) {
        const alreadyShown = !!r.activityId && shownActivityIdsRef.current.has(r.activityId);
        if (alreadyShown) {
          if (r.battle && r.levelsGained > 0) {
            emit(() =>
              toast({
                title: '⬆️ SUBIU DE NÍVEL!',
                description: 'Sua batalha rendeu experiência suficiente para evoluir. Vida restaurada! (energia regenera só com o tempo)',
                className: 'border-yellow-600 bg-yellow-950 text-yellow-100',
              })
            );
          }
          continue;
        }
        if (r.battle) {
          if (r.activityId) shownActivityIdsRef.current.add(r.activityId);
          battleOpenRef.current = true;
          setBattle(r.battle);
        } else if (r.message) {
          emit(() => toast({ description: r.message }));
        }
      }
    },
    [toast]
  );

  const showPlayerNotifications = useCallback(
    (notifications: PlayerNotificationView[] | undefined) => {
      if (!playerId || !Array.isArray(notifications) || notifications.length === 0) return;

      const acknowledge = async (id: string) => {
        try {
          const res = await fetch('/api/game/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId, ids: [id] }),
          });
          if (!res.ok) shownNotificationIdsRef.current.delete(id);
        } catch {
          shownNotificationIdsRef.current.delete(id);
        }
      };

      for (const notification of notifications) {
        if (shownNotificationIdsRef.current.has(notification.id)) continue;
        shownNotificationIdsRef.current.add(notification.id);

        const show = () => {
          const className =
            notification.kind === 'dragon_ball_lost'
              ? 'border-red-600 bg-red-950 text-red-100'
              : notification.kind === 'dragon_ball_stolen'
                ? 'border-amber-500 bg-amber-950 text-amber-100'
                : 'border-sky-600 bg-sky-950 text-sky-100';
          toast({
            title: notification.title,
            description: notification.message,
            className,
          });
          void acknowledge(notification.id);
        };

        // Quem roubou a Esfera só descobre DEPOIS de terminar de assistir
        // à batalha; a vítima offline recebe no primeiro estado ao voltar.
        if (battleOpenRef.current) deferredToastsRef.current.push(show);
        else show();
      }
    },
    [playerId, toast]
  );

  // ===== Polling leve: apenas estado pessoal a cada 15s =====
  useEffect(() => {
    if (screen !== 'game' || !playerId) return;
    let active = true;
    const fetchState = async () => {
      try {
        const requestStart = Date.now();
        const res = await fetch(`/api/game/state?playerId=${playerId}`, { cache: 'no-store' });
        if (!active) return;
        if (res.status === 401 || res.status === 403) {
          // sessão inválida ou personagem não pertence à conta
          setPlayerId(null);
          setPlayer(null);
          setAuth(null);
          setScreen('auth');
          return;
        }
        if (res.status === 404) {
          setPlayerId(null);
          setPlayer(null);
          setScreen(auth ? 'select' : 'auth');
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data.player) return;
        // v0.9.6 (Mudança 1): sincroniza o relógio do cliente com o do
        // servidor — os contadores (profissão/treino/energia) passam a
        // contar pela hora certa, não pelo relógio do dispositivo.
        noteServerTime(data.serverNow, requestStart);
        setGuildInvites(data.guildInvites ?? 0);
        setGuildMotd(data.guildMotd ?? '');
        stageIncomingBattle(data);
        applyPlayerState(data.player);
        // v0.9.24 (A1): a poll voltou a falar com o servidor — qualquer
        // resultado pendente de sincronização está resolvido agora
        setResultSyncPending(false);
        if (Array.isArray(data.pendingResults) && data.pendingResults.length > 0) {
          showAppliedResults(data.pendingResults);
        }
        showPlayerNotifications(data.pendingNotifications);
      } catch {
        // silencioso — próxima poll tenta de novo
      }
    };
    fetchState();
    const timer = setInterval(fetchState, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [playerId, screen, auth, applyPlayerState, showAppliedResults, showPlayerNotifications, stageIncomingBattle]);

  // ===== Handlers de autenticação (v0.8: contas na nuvem; v0.9.6: personagens) =====
  /**
   * Conclui um login (Supabase ou convidado). Conta de e-mail sem
   * personagens locais → tenta restaurar os personagens DA NUVEM (tabela
   * `personagens`, uma linha por guerreiro; ex.: banco local limpo por
   * uma atualização). Sem personagens salvos → garante a linha da CONTA
   * em `profiles` com o nick (login).
   */
  const handleAuthed = useCallback(
    async (account: AccountSession, chars: PlayerView[]) => {
      setAuth(account);

      let finalChars = chars;

      if (!account.isGuest && chars.length === 0) {
        const session = await getSupabaseSession();
        if (session) {
          // v0.9.6: personagens são LINHAS próprias na nuvem — cada um com
          // id/carteira/itens/cosméticos próprios (a conta só faz login).
          const { rows } = await loadCloudCharacters();
          if (rows && rows.length > 0) {
            // restaura da nuvem (o servidor valida e clampa tudo)
            try {
              const res = await fetch('/api/game/cloud-restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personagens: rows }),
              });
              const data = await res.json();
              if (res.ok && data.success !== false && Array.isArray(data.characters)) {
                finalChars = data.characters;
                if (data.restored > 0) {
                  toast({
                    title: '☁️ Progresso restaurado da nuvem!',
                    description: `${data.restored} ${data.restored === 1 ? 'guerreiro recuperado' : 'guerreiros recuperados'} — atualização passou, mas nada foi perdido.`,
                    className: 'border-sky-600 bg-sky-950 text-sky-100',
                  });
                }
              } else {
                console.error(
                  '[nuvem] FALHA na restauração dos personagens —',
                  `HTTP ${res.status}`,
                  data?.error ?? data?.message ?? ''
                );
              }
            } catch (err) {
              console.error('[nuvem] FALHA ao chamar a restauração dos personagens —', err);
            }
          } else if (rows === null) {
            // tabela `personagens` ainda não existe (SQL v0.9.6 pendente)
            // → formato antigo: profiles.progresso (v2), cosméticos da
            // conta duplicados para cada personagem pelo servidor.
            const profile = await loadCloudProfile();
            if (profile?.progresso?.characters?.length) {
              try {
                const res = await fetch('/api/game/cloud-restore', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ progresso: profile.progresso }),
                });
                const data = await res.json();
                if (res.ok && data.success !== false && Array.isArray(data.characters)) {
                  finalChars = data.characters;
                  if (data.restored > 0) {
                    toast({
                      title: '☁️ Progresso restaurado da nuvem!',
                      description: `${data.restored} ${data.restored === 1 ? 'guerreiro recuperado' : 'guerreiros recuperados'} — atualização passou, mas nada foi perdido.`,
                      className: 'border-sky-600 bg-sky-950 text-sky-100',
                    });
                  }
                } else {
                  console.error(
                    '[nuvem] FALHA na restauração do progresso (formato antigo) —',
                    `HTTP ${res.status}`,
                    data?.error ?? data?.message ?? ''
                  );
                }
              } catch (err) {
                console.error('[nuvem] FALHA ao chamar a restauração (formato antigo) —', err);
              }
            }
          } else {
            // conta nova: garante a linha da CONTA em profiles com o nick
            try {
              await ensureCloudProfileNick(account.username);
            } catch (err) {
              console.error('[nuvem] FALHA ao criar a linha do perfil na nuvem —', err);
            }
          }
        }
      }

      setCharacters(finalChars);
      setScreen(finalChars.length > 0 ? 'select' : 'create');
      toast({
        title: `⚔️ Salve, ${account.isGuest ? 'guerreiro' : account.username}!`,
        description: finalChars.length
          ? `Bem-vindo de volta! Você tem ${finalChars.length} ${finalChars.length === 1 ? 'guerreiro' : 'guerreiros'}.`
          : 'Agora forje seu primeiro guerreiro.',
      });
    },
    [toast]
  );

  // mantém o ref do boot apontando para a versão atual
  useEffect(() => {
    handleAuthedRef.current = handleAuthed;
  }, [handleAuthed]);

  // (logoutAccount vive adiante, logo após saveToCloud — depende dele)

  // ===== Personagens =====
  const enterCharacter = useCallback(
    (p: PlayerView) => {
      setPlayerId(p.id);
      setPlayer(p);
      setView('dashboard');
      setScreen('game');
      // registra o personagem ativo no SERVIDOR (fonte única no próximo boot)
      fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: p.id, type: 'select_player' }),
      }).catch(() => undefined);
    },
    []
  );

  const handleCreated = useCallback(
    (p: PlayerView) => {
      setCharacters((prev) => (prev.some((c) => c.id === p.id) ? prev : [...prev, p]));
      setPlayerId(p.id);
      setPlayer(p);
      setView('dashboard');
      setScreen('game');
      toast({
        title: '🐉 Bem-vindo, guerreiro!',
        description: `${p.name} está pronto para a aventura. Comece pelas profissões!`,
      });
    },
    []
  );

  const switchCharacter = useCallback(async () => {
    if (!auth) {
      setPlayerId(null);
      setPlayer(null);
      setBattle(null);
      setScreen('auth');
      return;
    }
    setPlayerId(null);
    setPlayer(null);
    setBattle(null);
    setLocalActivity(null);
    try {
      const res = await fetch('/api/auth/session', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.account) {
          setAuth(data.account);
          setCharacters(data.characters ?? []);
          setScreen(data.characters?.length > 0 ? 'select' : 'create');
          return;
        }
      }
    } catch {
      // segue para seleção com lista atual
    }
    setScreen('select');
  }, [auth]);

  // Atualiza o estado do personagem atual (usado pelo painel de admin
  // quando o alvo das ações é a própria conta logada; também desfaz o
  // otimismo de doAction quando o servidor recusa/falha).
  const refreshGameState = useCallback(async () => {
    if (!playerId) return;
    try {
      const requestStart = Date.now();
      const res = await fetch(`/api/game/state?playerId=${playerId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.serverNow) noteServerTime(data.serverNow, requestStart);
      if (data.player) { stageIncomingBattle(data); applyPlayerState(data.player); }
    } catch {
      // silencioso — a poll de 15s corrige
    }
  }, [playerId, applyPlayerState, stageIncomingBattle]);

  // ===== Ações do jogo (intenção → servidor decide tudo) =====
  // Cada tentativa leva um requestId (UUID): o servidor é idempotente —
  // um retry de rede com o MESMO id devolve o resultado em cache.
  //
  // v0.9.24 (B2) — DELTA OTIMISTA SISTÊMICO: transações com delta
  // CONHECIDO (custo exibido/recompensa anunciada) aplicam o estado
  // CONSISTENTE na hora (ganho + level-up + carry sempre juntos) e a
  // resposta do servidor reconcilia. O padrão das conquistas (v0.9.20),
  // agora para TODOS os fluxos — o servidor segue sendo a verdade.
  const actionInFlightRef = useRef(false);
  const doAction = useCallback(
    async (payload: Record<string, unknown>): Promise<boolean> => {
      if (!playerId || busy || actionInFlightRef.current) return false;
      actionInFlightRef.current = true;
      setBusy(true);
      const requestId = crypto.randomUUID();
      // v0.9.24 (B2): painéis que conhecem o delta anexam `optimistic`
      // (ex.: coleta de quest com recompensa anunciada); ações com custo
      // de tabela têm delta próprio computado aqui. Aplicado ANTES do
      // fetch — o clique nunca espera o servidor para SEQUER começar a
      // se ver refletido. (O campo é REMOVIDO do corpo enviado: é só UI.)
      const { optimistic: payloadOptimistic, ...serverPayload } = payload;
      const optimisticDelta =
        (payloadOptimistic as OptimisticDelta | undefined) ??
        (player ? builtinOptimisticDelta(player, payload) : null);
      if (optimisticDelta && player) {
        setPlayer((prev) => (prev ? applyOptimisticDelta(prev, optimisticDelta) : prev));
      }
      const send = async () => {
        const session = ['attack_player', 'guild_invite'].includes(String(payload.type)) ? await getSupabaseSession() : null;
        return fetch('/api/game/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ playerId, requestId, ...serverPayload }),
        });
      };
      try {
        const requestStart = Date.now();
        let res: Response;
        try {
          res = await send();
        } catch (networkError) {
          // primeira falha de rede → UM retry com o MESMO requestId
          // (idempotência server-side evita execução duplicada)
          if (retryRef.current) throw networkError;
          retryRef.current = true;
          try {
            res = await send();
          } finally {
            retryRef.current = false;
          }
        }
        const data = await res.json();
        // v0.9.6 (Mudança 1): sincroniza o relógio com o servidor em CADA
        // resposta de ação (o jogo responde bastante — o offset fica fresco).
        if (data.serverNow) noteServerTime(data.serverNow, requestStart);
        if (!res.ok || data.success === false) {
          // recusado → desfaz o otimismo com a VERDADE do servidor
          if (optimisticDelta) refreshGameState();
          toast({
            title: '⚠ Não foi possível',
            description: data.error?.message ?? 'Ação inválida',
            variant: 'destructive',
          });
          return false;
        }
        if (data.player) { stageIncomingBattle(data); applyPlayerState(data.player); }
        if (Array.isArray(data.appliedResults) && data.appliedResults.length > 0) {
          showAppliedResults(data.appliedResults);
        }
        showPlayerNotifications(data.notifications);
        if (data.activity) {
          // ===== ATIVIDADE com duração server-side (treino/batalha) =====
          // o servidor persistiu início/término; a UI anima pelo tempo
          // restante e busca o resultado quando termina.
          setLocalActivity(data.activity);
          if (data.activity.kind === 'battle' && data.activity.result?.battle) {
            // marca como EXIBIDA: o pendingResults futuro não pode repetir
            if (!shownActivityIdsRef.current.has(data.activity.id)) {
              shownActivityIdsRef.current.add(data.activity.id);
              battleOpenRef.current = true;
              setBattle(data.activity.result.battle);
            }
          } else if (data.message) {
            toast({ description: data.message });
          }
        } else if (data.battle) {
          battleOpenRef.current = true;
          setBattle(data.battle);
        } else if (data.levelsGained > 0) {
          toast({ title: `⬆️ SUBIU PARA O NÍVEL ${data.player.level}!`, description: 'Vida restaurada. Energia regenera somente com o tempo.' });
          if (data.message) toast({ description: data.message });
        } else if (data.message) {
          toast({ description: data.message });
        }
        return true;
      } catch {
        // erro de conexão → o otimismo não pode ficar sem reconciliação
        if (optimisticDelta) refreshGameState();
        toast({
          title: '⚠ Erro de conexão',
          description: 'Verifique sua internet e tente novamente.',
          variant: 'destructive',
        });
        return false;
      } finally {
        actionInFlightRef.current = false;
        setBusy(false);
      }
    },
    [playerId, busy, player, toast, applyPlayerState, showAppliedResults, showPlayerNotifications, refreshGameState, stageIncomingBattle]
  );

  // ===== Atividade viva: local (iniciada aqui) OU retomada do servidor =====
  const runningActivity: ActivityView | null = localActivity ?? player?.runningActivity ?? null;

  // ===== v0.9.20 — COLETA DE CONQUISTAS: UI OTIMISTA =====
  // O clique credita o saldo NA HORA (feedback < 300ms), dispara o toast
  // de recompensa NO MESMO TICK do clique e reconcilia com o servidor em
  // seguida. SEM busy global: várias conquistas podem ser coletadas em
  // sequência rápida, cada uma com feedback imediato.
  const claimAchievement = useCallback(
    async (a: ClaimableAchievement): Promise<boolean> => {
      if (!playerId) return false;
      const requestId = crypto.randomUUID();
      pendingClaimsRef.current += 1;

      // 1) FEEDBACK IMEDIATO — antes de qualquer await: delta otimista
      //    CONSISTENTE (v0.9.24 B2: XP sempre COM level-up + carry — o
      //    bug "363/234 XP e nível 2" era o XP somado sem recalcular o
      //    nível) + toast de recompensa no MESMO TICK do clique
      setPlayer((prev) =>
        prev
          ? applyOptimisticDelta(prev, {
              zeni: a.rewardZeni,
              xp: a.rewardXp,
              crystals: a.rewardCrystals,
            })
          : prev
      );
      const parts = [
        a.rewardZeni > 0 ? `+${a.rewardZeni.toLocaleString('pt-BR')} Zeni` : '',
        a.rewardXp > 0 ? `+${a.rewardXp.toLocaleString('pt-BR')} XP` : '',
        a.rewardCrystals > 0 ? `+${a.rewardCrystals.toLocaleString('pt-BR')} 💎` : '',
      ].filter(Boolean);
      // v0.9.24 (B2): level-up otimista anunciado JUNTO com a coleta —
      // XP e nível nunca divergem na tela (estado atômico desde o clique)
      const optLevels = player ? optimisticLevelsGained(player, a.rewardXp) : 0;
      toast({
        title:
          optLevels > 0 && player
            ? `🎁 Recompensa coletada: ${a.name} — ⬆️ NÍVEL ${player.level + optLevels}!`
            : `🎁 Recompensa coletada: ${a.name}!`,
        description: parts.join(' • '),
        className: 'border-emerald-600 bg-emerald-950 text-emerald-100',
      });

      // 2) SERVIDOR — caminho silencioso (sem duplicar o toast acima,
      //    sem busy global): o servidor valida, credita de forma atômica
      //    (impossível coletar 2x) e devolve a verdade
      try {
        const requestStart = Date.now();
        const res = await fetch('/api/game/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, requestId, type: 'claim_achievement', achievementId: a.achievementId }),
        });
        const data = await res.json();
        if (data.serverNow) noteServerTime(data.serverNow, requestStart);
        if (!res.ok || data.success === false) {
          // recusado → desfaz o otimismo com a VERDADE do servidor
          toast({
            title: '⚠ Não foi possível',
            description: data.error?.message ?? 'Ação inválida',
            variant: 'destructive',
          });
          refreshGameState();
          return false;
        }
        // reconciliação: estado real (saldo, XP, nível, vida...)
        if (data.player) latestClaimPlayerRef.current = data.player;
        if (data.levelsGained > 0) {
          toast({
            title: `⬆️ SUBIU PARA O NÍVEL ${data.player.level}!`,
            description: 'Vida totalmente restaurada. Seu poder cresce! (energia continua regenerando só com o tempo)',
            className: 'border-yellow-600 bg-yellow-950 text-yellow-100',
          });
        }
        if (Array.isArray(data.appliedResults) && data.appliedResults.length > 0) {
          showAppliedResults(data.appliedResults);
        }
        return true;
      } catch {
        toast({
          title: '⚠ Erro de conexão',
          description: 'Verifique sua internet — o estado será sincronizado em instantes.',
          variant: 'destructive',
        });
        refreshGameState();
        return false;
      } finally {
        pendingClaimsRef.current -= 1;
        // última coleta em andamento → aplica a verdade mais recente agora
        // (inclui TODAS as coletas desta rajada); coletas anteriores deixam
        // a verdade chegar só na última resposta, sem flicker no saldo
        if (pendingClaimsRef.current === 0 && latestClaimPlayerRef.current) {
          applyPlayerState(latestClaimPlayerRef.current);
          latestClaimPlayerRef.current = null;
        }
      }
    },
    [playerId, player, toast, applyPlayerState, refreshGameState, showAppliedResults]
  );

  // v0.5 — RETOMADA DA BATALHA APÓS RELOAD: se o servidor reporta uma
  // batalha em andamento que ainda não foi exibida nesta sessão (ex.:
  // página recarregada no meio), a animação é retomada do restante e a
  // atividade já entra como "exibida" (o resultado final não repetirá).
  useEffect(() => {
    const ra = player?.runningActivity;
    if (!ra || shownActivityIdsRef.current.has(ra.id)) return;
    if (ra.kind === 'battle' && ra.result?.battle) {
      shownActivityIdsRef.current.add(ra.id);
      setLocalActivity(ra);
      battleOpenRef.current = true;
      setBattle(ra.result.battle);
    }
  }, [player?.runningActivity]);

  // Quando a atividade local esgota a duração, busca o estado — o servidor
  // aplica o resultado (exactly-once) e devolve pendingResults para exibir.
  //
  // A conclusão usa uma action LEVE dedicada: resolve a atividade e devolve
  // o Player atualizado sem carregar ranking/quests/invites do /state.
  // Há timeout real de 12s; falha total libera a UI e mostra retry.
  const [resultSyncPending, setResultSyncPending] = useState(false);
  const fetchActivityResult = useCallback(
    async (attempt = 0): Promise<boolean> => {
      if (!playerId) return true;
      const controller = new AbortController();
      // Antes este fluxo usava /api/game/state sem timeout real. Quando a
      // resolução do torneio pegava uma conexão lenta, a UI podia ficar
      // presa em "Luta em andamento (0s)" por dezenas de segundos.
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const requestStart = Date.now();
        const res = await fetch('/api/game/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ playerId, type: 'sync_activity' }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (data.serverNow) noteServerTime(data.serverNow, requestStart);
        if (data.player) { stageIncomingBattle(data); applyPlayerState(data.player); }
        if (Array.isArray(data.appliedResults) && data.appliedResults.length > 0) {
          showAppliedResults(data.appliedResults);
        }
        showPlayerNotifications(data.notifications);
        setResultSyncPending(false);
        return true;
      } catch (error) {
        // Timeout não dispara uma segunda mutação concorrente: o servidor
        // pode terminar o primeiro pedido mesmo após o abort do navegador.
        const timedOut = error instanceof DOMException && error.name === 'AbortError';
        if (!timedOut && attempt < 1) {
          await new Promise((r) => setTimeout(r, 1200));
          return fetchActivityResult(attempt + 1);
        }
        return false;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [playerId, applyPlayerState, showAppliedResults, showPlayerNotifications, stageIncomingBattle]
  );

  useEffect(() => {
    if (!localActivity) return;
    // v0.9.6 (Mudança 1): restante calculado pelo RELÓGIO DO SERVIDOR —
    // o fim da atividade é um timestamp do servidor (endsAt, UTC).
    const remaining = Math.max(0, new Date(localActivity.endsAt).getTime() - serverNowMs());
    const timer = setTimeout(async () => {
      setLocalActivity(null);
      if (!playerId) return;
      const ok = await fetchActivityResult();
      if (!ok) {
        // falha total: libera o personagem localmente (a atividade venceu
        // no servidor — não bloqueia novas ações lá) e sinaliza o banner
        setPlayer((prev) =>
          prev && prev.runningActivity ? { ...prev, runningActivity: null } : prev
        );
        setResultSyncPending(true);
      }
    }, remaining + 120);
    return () => clearTimeout(timer);
  }, [localActivity, playerId, applyPlayerState, showAppliedResults, fetchActivityResult]);

  // ===== v0.9.6 — AUTO-SAVE na nuvem (tabela `personagens`) =====
  // Dispara sempre que algo importante muda (subiu de nível, ganhou XP/
  // Zeni, comprou, treinou, iniciou/cancelou/coletou turno...): o servidor
  // produz UMA LINHA POR PERSONAGEM (/api/game/cloud-snapshot) e o cliente
  // grava cada uma com a sessão do próprio usuário (RLS). Depois de um
  // save bem-sucedido, linhas antigas que não existem mais no servidor
  // (personagem excluído / linha migrada) são limpas — a nuvem fica
  // EXATAMENTE igual ao servidor. Convidados não salvam.

  /** Executa um save na nuvem agora (se aplicável).
   *
   * v0.9.4: `fp` é a impressão digital que motivou o save — só é marcada
   * como "salva" em SUCESSO (antes um save falho era dado como salvo e
   * nunca mais tentado). Sem `fp`, usa a impressão digital mais recente.
   */
  const saveToCloud = useCallback(async (fp?: string | null): Promise<boolean> => {
    if (!auth || auth.isGuest || cloudSaveInFlightRef.current) return false;
    cloudSaveInFlightRef.current = true;
    try {
      // playerId é OPCIONAL: sem personagem ativo (ex.: acabou de excluir
      // o último na tela de seleção), o snapshot devolve a lista da conta —
      // e a limpeza remove da nuvem as linhas que não existem mais.
      const qs = playerId ? `?playerId=${playerId}` : '';
      const snapRes = await fetch(`/api/game/cloud-snapshot${qs}`, {
        cache: 'no-store',
      });
      const snap = await snapRes.json();
      if (!snapRes.ok || snap.success === false || !Array.isArray(snap.personagens)) {
        console.error(
          '[nuvem] FALHA ao gerar os personagens no servidor —',
          `HTTP ${snapRes.status}`,
          snap?.error ?? snap?.message ?? ''
        );
        return false;
      }
      const rows = snap.personagens as import('@/lib/supabase/client').CloudCharacterRow[];
      const saved = await upsertCloudCharacters(rows);
      if (!saved) return false;
      // sincroniza: remove da nuvem o que não existe mais no servidor
      // (personagem excluído / linha antiga da migração)
      await deleteStaleCloudCharacters(rows.map((r) => r.id));
      lastSavedCloudRef.current = fp ?? fingerprintRef.current;
      return true;
    } catch {
      return false;
    } finally {
      cloudSaveInFlightRef.current = false;
    }
  }, [playerId, auth]);

  // v0.9.4 — LOGOUT SEMPRE SALVA: a sessão do Supabase é encerrada só
  // DEPOIS do save na nuvem (antes, o save do logout rodava após o
  // signOut e falhava em silêncio — sem sessão não há como gravar).
  const logoutAccount = useCallback(async () => {
    try {
      await Promise.race([saveToCloud(), new Promise((r) => setTimeout(r, 5000))]);
    } catch {
      // segue o logout — o auto-save da próxima sessão cobre
    }
    await supabaseSignOut();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // segue o logout local mesmo se o pedido falhar
    }
    setAuth(null);
    setCharacters([]);
    setPlayerId(null);
    setPlayer(null);
    setBattle(null);
    setLocalActivity(null);
    lastSavedCloudRef.current = null;
    lastImportantRef.current = null;
    setScreen('auth');
  }, [saveToCloud]);

  // v0.9.6 — EXCLUSÃO DE PERSONAGEM também sincroniza a nuvem na hora
  // (vive DEPOIS de saveToCloud, do qual depende — mesmo padrão do
  // logoutAccount acima).
  const deleteCharacter = useCallback(
    async (p: PlayerView): Promise<boolean> => {
      try {
        const res = await fetch(`/api/game/character/${p.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || data.success === false) {
          toast({
            title: '⚠ Não foi possível excluir',
            description: data.error?.message ?? 'Tente novamente.',
            variant: 'destructive',
          });
          return false;
        }
        setCharacters((prev) => prev.filter((c) => c.id !== p.id));
        toast({ description: ` ${p.name} foi despedido. Que a força o acompanhe.` });
        // a exclusão vai PARA A NUVEM na hora — o save sincroniza as
        // linhas restantes e LIMPA a linha do personagem excluído
        // (senão ele "ressuscitaria" numa restauração futura).
        if (auth && !auth.isGuest) {
          // pequena espera: deixa o estado local assentar antes do snapshot
          setTimeout(() => {
            saveToCloud().catch(() => undefined);
          }, 400);
        }
        return true;
      } catch {
        toast({
          title: '⚠ Erro de conexão',
          description: 'Verifique sua internet e tente novamente.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast, auth, saveToCloud]
  );

  /** Impressão digital do estado relevante — muda ⇒ precisa salvar. */
  const cloudFingerprint = useMemo(() => {
    if (!player || !auth) return null;
    return JSON.stringify({
      acc: auth.id,
      chars: characters
        .map((c) => [c.id, c.name, c.level, c.zeni, c.crystals])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      p: {
        id: player.id,
        name: player.name,
        level: player.level,
        xp: player.xp,
        zeni: player.zeni,
        crystals: player.crystals,
        hp: player.hp,
        energy: player.energy,
        strength: player.strength,
        defense: player.defense,
        speed: player.speed,
        ki: player.ki,
        battlesWon: player.battlesWon,
        battlesLost: player.battlesLost,
        missionsDone: player.missionsDone,
        dragonBalls: player.dragonBalls,
        avatarUrl: player.avatarUrl,
        items: player.items,
        techniques: player.techniques,
        loadout: player.loadout,
        strategy: player.strategy,
        transformation: player.transformation?.id ?? null,
        transformationsOwned: player.transformationsOwned,
        professions: player.professions,
        cosmetics: player.cosmetics,
      },
    });
  }, [player, characters, auth]);

  // v0.9.4 — impressão digital dos EVENTOS IMPORTANTES (nível, batalhas,
  // avatar, diamantes, itens/cosméticos/transformações, profissões):
  // qualquer mudança aqui dispara save IMEDIATO na nuvem.
  const importantFingerprint = useMemo(() => {
    if (!player || !auth) return null;
    return JSON.stringify({
      acc: auth.id,
      chars: characters
        .map((c) => [c.id, c.name, c.level, c.crystals])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      p: {
        level: player.level,
        crystals: player.crystals,
        battlesWon: player.battlesWon,
        battlesLost: player.battlesLost,
        avatarUrl: player.avatarUrl,
        dragonBalls: player.dragonBalls,
        items: player.items,
        techniques: player.techniques,
        loadout: player.loadout,
        transformation: player.transformation?.id ?? null,
        transformationsOwned: player.transformationsOwned,
        professions: player.professions,
        cosmetics: player.cosmetics,
        // v0.9.6 (Mudança 2): turno de profissão entra na impressão
        // IMPORTANTE — iniciar/cancelar/coletar um turno salva na nuvem
        // na hora (o cancelamento exige save imediato por especificação).
        missionId: player.activeMission?.missionId ?? null,
        missionEndsAt: player.activeMission?.endsAt ?? null,
      },
    });
  }, [player, characters, auth]);

  // espelha a impressão digital mais recente para saves sem gatilho
  // (periódico/logout/aba ociosa) poderem marcá-la como salva
  useEffect(() => {
    fingerprintRef.current = cloudFingerprint;
  }, [cloudFingerprint]);

  useEffect(() => {
    if (screen !== 'game' || !cloudFingerprint || !auth || auth.isGuest || !player) return;
    if (cloudFingerprint === lastSavedCloudRef.current) return;

    // v0.9.4 — evento IMPORTANTE (subiu de nível, ganhou batalha, comprou,
    // trocou avatar, transformação, profissão...) → salva IMEDIATAMENTE
    if (importantFingerprint !== lastImportantRef.current) {
      lastImportantRef.current = importantFingerprint;
      saveToCloud(cloudFingerprint);
      return;
    }

    // qualquer outra mudança (energia regenerando, XP, Zeni...) → salva
    // com pequeno atraso (agrupa rajadas)
    const timer = setTimeout(() => {
      if (cloudFingerprint === lastSavedCloudRef.current) return;
      saveToCloud(cloudFingerprint);
    }, 6000);
    return () => clearTimeout(timer);
  }, [cloudFingerprint, importantFingerprint, screen, auth, player, saveToCloud]);

  // v0.9.4 — INTERVALO DE SEGURANÇA (45s): salva SEMPRE enquanto joga,
  // mesmo sem mudança visível no cliente — cobre progresso que só existe
  // no servidor (quests do período, atividades vencidas, conquistas) e
  // tenta de novo qualquer save que tenha falhado antes.
  useEffect(() => {
    if (screen !== 'game' || !playerId || !auth || auth.isGuest) return;
    const timer = setInterval(() => {
      saveToCloud();
    }, 45_000);
    return () => clearInterval(timer);
  }, [screen, playerId, auth, saveToCloud]);

  // ao trocar de personagem, o fingerprint muda de qualquer forma — mas o
  // save anterior pode estar em atraso; força um save imediato ao trocar
  useEffect(() => {
    if (screen === 'game' && playerId) {
      return () => {
        saveToCloud();
      };
    }
  }, [playerId, screen, saveToCloud]);

  // aba escondida / página fechada → melhor esforço para salvar
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && screen === 'game' && playerId) {
        saveToCloud();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [screen, playerId, saveToCloud]);

  // ===== Telas =====
  if (screen === 'boot') {
    return (
      <main className="min-h-screen bg-[#14100b] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl animate-bounce mb-4" aria-hidden>
            🐉
          </div>
          <p className="font-heading text-amber-200/70 animate-pulse">Carregando o universo...</p>
        </div>
      </main>
    );
  }

  if (screen === 'auth') {
    return (
      <main className="min-h-screen bg-[#14100b]">
        <AuthGate onAuthed={handleAuthed} />
      </main>
    );
  }

  if (screen === 'select' && auth) {
    return (
      <main className="min-h-screen bg-[#14100b]">
        <CharacterSelect
          account={auth}
          characters={characters}
          onSelect={enterCharacter}
          onCreate={() => setScreen('create')}
          onLogout={logoutAccount}
          onDelete={deleteCharacter}
        />
      </main>
    );
  }

  if (screen === 'create' || !playerId || !player) {
    return (
      <main className="min-h-screen bg-[#14100b]">
        <CharacterCreate
          onCreated={handleCreated}
          onBack={auth ? () => setScreen('select') : undefined}
        />
      </main>
    );
  }

  const hpPct = Math.round((player.hp / player.derived.maxHp) * 100);
  const energyPct = Math.round((player.energy / player.derived.maxEnergy) * 100);
  // v0.6 — barra de XP sempre visível no header (em TODAS as abas)
  const xpPct = Math.min(100, Math.round((player.xp / Math.max(1, player.xpToNext)) * 100));
  const xpRemaining = Math.max(0, player.xpToNext - player.xp);

  // ===== Cosméticos equipados (v0.5) — derivados UMA vez por render =====
  const equipped = player.cosmetics?.equipped ?? {};
  const screenEffect = equippedCosmetic(equipped, 'effect')?.screenEffect ?? null;
  const playerTitle = equippedCosmetic(equipped, 'title')?.titleText ?? null;

  const openView = (v: View) => {
    setView(v);
    setMoreOpen(false);
  };

  return (
    <main className="min-h-screen bg-[#14100b] flex flex-col pb-16 lg:pb-0">
      {/* Efeito de entrada (cosmético): clarão de teleporte ou onda de Ki */}
      {screenEffect && <ScreenEffect key={`fx-${player.id}`} effect={screenEffect} />}

      {/* Fundo decorativo */}
      <div
        className="fixed inset-0 pointer-events-none opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(180,83,9,0.25), transparent), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(120,53,15,0.15), transparent)',
        }}
        aria-hidden
      />

      {/* ===== Header (desktop + mobile) ===== */}
      <header className="sticky top-0 z-40 bg-[#14100b]/90 backdrop-blur border-b border-amber-900/40">
        {guildInvites > 0 && <button className="w-full bg-emerald-950 p-2 text-emerald-200" onClick={() => setView('guilds')}>🛡️ {guildInvites} convite(s) de guilda — abrir</button>}
        {guildMotd && <div className="bg-amber-950 px-3 py-2 text-sm text-amber-100 break-words">📣 {guildMotd}</div>}
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex items-center gap-3 py-2.5">
            <a
              href="/"
              className="font-display text-xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 shrink-0 tracking-wide"
              title="Guerreiros Místicos — página inicial"
            >
              Guerreiros Místicos
            </a>

            <div className="flex-1" />

            {/* Recursos rápidos */}
            <div className="hidden sm:flex items-center gap-4 text-xs font-heading">
              <span className="text-yellow-400" title="Zeni">
                🪙 {player.zeni.toLocaleString('pt-BR')}
              </span>
              <span className="text-sky-300" title="Cristais">
                💎 {player.crystals}
              </span>
              <span className={hpPct < 25 ? 'text-red-400' : 'text-emerald-400'} title="Vida">
                ❤️ {player.hp}/{player.derived.maxHp}
              </span>
              <span className="text-amber-300" title="Energia">
                ⚡ {player.energy}/{player.derived.maxEnergy}
              </span>
              {/* v0.6 — XP sempre visível: quanto tem / quanto falta p/ o próximo nível */}
              <span
                className="text-orange-300"
                title={`Experiência — faltam ${xpRemaining.toLocaleString('pt-BR')} XP para o nível ${player.level + 1}`}
              >
                ⭐ {player.xp}/{player.xpToNext}
              </span>
              {player.dragonBalls > 0 && (
                <span className="text-orange-300" title="Esferas do Dragão">
                  🔮 {player.dragonBalls}/7
                </span>
              )}
            </div>

            {/* Perfil */}
            <div className="flex items-center gap-2">
              {/* Wiki — manual do jogo (mesmo ícone do login; nova aba preserva timers/luta) */}
              <WikiIconLink />
              <div className="flex items-center gap-2 bg-black/40 rounded-full pl-1 pr-3 py-1 border border-amber-900/40">
                <PlayerAvatar
                  race={player.race}
                  avatarUrl={player.avatarUrl}
                  cosmetics={player.cosmetics}
                  className="w-8 h-8"
                  emojiSize="text-base"
                />
                <div className="hidden md:block leading-tight">
                  <p className="text-xs font-heading text-amber-100 max-w-36 truncate">
                    {player.name}
                    {playerTitle && <span className="text-yellow-400/90"> {playerTitle}</span>}
                  </p>
                  <p className="text-[10px] text-amber-200/50">Nível {player.level}</p>
                  {/* mini barra de XP (v0.6) */}
                  <div
                    className="mt-1 w-24 h-1.5 bg-black/60 rounded-full overflow-hidden border border-amber-900/50"
                    title={`XP: ${player.xp}/${player.xpToNext} — faltam ${xpRemaining.toLocaleString('pt-BR')}`}
                  >
                    <div
                      className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full"
                      style={{ width: `${xpPct}%` }}
                    />
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Menu do jogador"
                  className="p-2 rounded-lg bg-black/40 border border-amber-900/40 text-amber-200/70 hover:text-amber-100 hover:border-amber-600/50 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#1e1710] border-amber-800/60 text-amber-100">
                  {auth && !auth.isGuest && (
                    <div className="px-2 py-1.5 text-[11px] text-amber-200/50 font-heading">
                      Conta: {auth.username} · salvando na nuvem ☁
                    </div>
                  )}
                  {auth?.isGuest && (
                    <>
                      <div className="px-2 py-1.5 text-[11px] text-amber-200/50 font-heading">
                        Progresso de convidado
                      </div>
                      <DropdownMenuItem
                        onClick={() => setSaveOpen(true)}
                        className="text-emerald-300 focus:text-emerald-200"
                      >
                        <Save className="w-4 h-4 mr-2" /> Salvar meu guerreiro
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator className="bg-amber-900/40" />
                  <DropdownMenuItem onClick={switchCharacter} className="text-amber-200 focus:text-amber-100">
                    <Repeat className="w-4 h-4 mr-2" />
                    {auth ? 'Trocar de personagem' : 'Trocar de guerreiro'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logoutAccount} className="text-red-300 focus:text-red-200">
                    <LogOut className="w-4 h-4 mr-2" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Recursos mobile */}
          <div className="sm:hidden flex items-center gap-3 text-[11px] font-heading pb-2 overflow-x-auto scrollbar-none">
            <span className="text-yellow-400 whitespace-nowrap">🪙 {player.zeni.toLocaleString('pt-BR')}</span>
            <span className="text-sky-300 whitespace-nowrap">💎 {player.crystals}</span>
            <span className={`${hpPct < 25 ? 'text-red-400' : 'text-emerald-400'} whitespace-nowrap`}>
              ❤️ {player.hp}/{player.derived.maxHp}
            </span>
            <span className="text-amber-300 whitespace-nowrap">⚡ {energyPct}%</span>
            <span
              className="text-orange-300 whitespace-nowrap"
              title={`Experiência — faltam ${xpRemaining.toLocaleString('pt-BR')} XP para o nível ${player.level + 1}`}
            >
              ⭐ {player.xp}/{player.xpToNext}
            </span>
            {player.dragonBalls > 0 && (
              <span className="text-orange-300 whitespace-nowrap">🔮 {player.dragonBalls}/7</span>
            )}
          </div>

          {/* Navegação desktop */}
          <nav className="hidden lg:flex gap-1 overflow-x-auto scrollbar-thin pb-1" role="navigation" aria-label="Seções do jogo">
            {NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                aria-current={view === item.key ? 'page' : undefined}
                className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-heading whitespace-nowrap transition-all border ${
                  view === item.key
                    ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white border-orange-400 shadow-md shadow-orange-900/50'
                    : 'bg-black/30 text-amber-200/60 border-transparent hover:text-amber-100 hover:bg-black/50'
                }`}
              >
                {item.icon}
                {item.label}
                {item.key === 'shenron' && player.dragonBalls >= 7 && (
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping absolute" aria-hidden />
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* v0.9.24 (A1) — banner de resultado pendente: a atividade venceu no
          servidor mas nenhuma busca de estado conseguiu sincronizar (3
          tentativas + poll de 15s falharam). Navegação LIBERADA; o botão
          tenta buscar o resultado salvo de novo (a poll também reconecta
          sozinha quando a rede volta). */}
      {resultSyncPending && (
        <div
          role="alert"
          className="sticky top-[64px] lg:top-[104px] z-30 bg-amber-950/95 border-y border-amber-600/60"
        >
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-amber-200 font-heading flex items-center gap-1.5">
              <CloudOff className="w-4 h-4 text-amber-400" aria-hidden />
              Resultado pendente — não foi possível sincronizar com o servidor.
            </span>
            <GameButton
              size="sm"
              onClick={() => {
                void fetchActivityResult();
              }}
              className="ml-auto"
            >
              <RotateCw className="w-3.5 h-3.5" /> Tentar novamente
            </GameButton>
          </div>
        </div>
      )}

      {/* ===== Conteúdo ===== */}
      <div className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-6 relative">
        {view === 'dashboard' && <Dashboard player={player} onNavigate={(v) => setView(v as View)} onOpenAvatar={() => setAvatarOpen(true)} />}
        {view === 'training' && (
          <TrainingPanel player={player} onAction={(payload) => doAction(payload)} busy={busy} />
        )}
        {view === 'missions' && (
          <ProfessionsPanel player={player} onAction={(payload) => doAction(payload)} busy={busy} onRefresh={refreshGameState} />
        )}
        {view === 'inventory' && (
          <InventoryPanel player={player} onAction={(payload) => doAction(payload)} busy={busy} />
        )}
        {view === 'battle' && (
          <BattlePanel
            player={player}
            onBattle={(enemyId) => doAction({ type: 'battle', enemyId })}
            onBossAttack={() => doAction({ type: 'world_boss_attack' })}
            busy={busy}
          />
        )}
        {view === 'tournament' && <TournamentPanel player={player} onAction={doAction} busy={busy} />}
        {view === 'shop' && (
          <ShopPanel player={player} onAction={(payload) => doAction(payload)} busy={busy} />
        )}
        {view === 'market' && (
          <MarketPanel player={player} onRefresh={refreshGameState} />
        )}
        {view === 'ranking' && (
          <RankingPanel
            player={player}
            onAttack={(targetId) => doAction({ type: 'attack_player', targetId })}
            busy={busy}
          />
        )}
        {view === 'guilds' && (
          <GuildsPanel player={player} onAction={doAction} busy={busy} />
        )}
        {view === 'shenron' && (
          <ShenronPanel
            player={player}
            onWish={(wishType) => doAction({ type: 'wish', wishType })}
            busy={busy}
          />
        )}
        {view === 'achievements' && (
          <AchievementsPanel player={player} onClaim={claimAchievement} />
        )}
      </div>

      {/* Rodapé (desktop) */}
      <footer className="hidden lg:block mt-auto border-t border-amber-900/30 py-4 text-center text-[11px] text-amber-200/30 px-4">
        Guerreiros Místicos — jogo de fã inspirado nos clássicos browser games de gerenciamento.{' '}
        {auth && !auth.isGuest
          ? `Progresso de ${auth.username} salvo na nuvem — sobrevive a qualquer atualização.`
          : 'Progresso de convidado — use "Salvar meu guerreiro" no menu para criar sua conta na nuvem sem perder nada.'}
      </footer>

      {/* ===== Navegação mobile (bottom) ===== */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#1a130c]/95 backdrop-blur border-t border-amber-900/50 pb-[env(safe-area-inset-bottom)]"
        role="navigation"
        aria-label="Navegação principal mobile"
      >
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map((key) => {
            const item = NAV.find((n) => n.key === key)!;
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-heading transition-all duration-200 active:scale-90 ${
                  active ? 'text-orange-300' : 'text-amber-200/50'
                }`}
              >
                {/* v0.9.12 — indicador da aba ativa (filete âmbar no topo) */}
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-500"
                    aria-hidden
                  />
                )}
                <span className={`text-xl ${active ? 'drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]' : ''}`}>{item.icon}</span>
                {item.short}
              </button>
            );
          })}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-heading transition-colors ${
                ['inventory', 'shop', 'market', 'ranking', 'guilds', 'shenron', 'achievements', 'tournament'].includes(view)
                  ? 'text-orange-300'
                  : 'text-amber-200/50'
              }`}
            >
              <span className="text-xl">
                <Menu className="w-5 h-5" />
              </span>
              Mais
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-[#1e1710] border-amber-800/60 text-amber-100 rounded-t-2xl">
              <SheetHeader className="pb-2">
                <SheetTitle className="font-heading text-amber-100 text-left">Mais seções</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-3 pb-6">
                {(['inventory', 'shop', 'market', 'ranking', 'guilds', 'shenron', 'achievements', 'tournament'] as View[]).map((key) => {
                  const item = NAV.find((n) => n.key === key)!;
                  return (
                    <button
                      key={key}
                      onClick={() => openView(key)}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-heading transition-all ${
                        view === key
                          ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white border-orange-400'
                          : 'bg-black/30 text-amber-200/70 border-amber-900/40 hover:border-amber-600/50'
                      }`}
                    >
                      <span className="text-2xl">{item.icon}</span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Chat existe somente dentro do jogo. Login, criação e seleção de
          personagem não montam o widget nem fazem polling. O key força uma
          instância limpa e imediata ao trocar de guerreiro. */}
      <ChatWidget key={player.id} player={player} />

      {/* v0.9 — PAINEL DO ADMINISTRADOR: montado SOMENTE quando a RPC
          is_admin() (Supabase) confirmou a conta administradora. Para os
          demais usuários este código nem é baixado pelo navegador. */}
      {isAdmin && <AdminPanel onSelfModified={refreshGameState} />}

      {/* v0.9 — TREINO INSTANTÂNEO: não existe mais overlay de treino (o
          ganho é aplicado no clique e o botão faz a micro-animação).
          Batalhas continuam com duração server-side e diálogo travado
          até o desfecho (lockUntil). */}

      {/* Dialog de batalha (só fecha quando TERMINA — botão Continuar;
          travado até o fim da duração server-side da atividade; v0.9.21:
          o "Continuar" também ACORDA o fundo com o estado diferido) */}
      <BattleLogDialog
        battle={battle}
        player={player}
        lockUntil={runningActivity?.kind === 'battle' ? runningActivity.endsAt : undefined}
        onClose={() => {
          setBattle(null);
          flushBattleDeferredState();
        }}
      />

      {/* Dialog de troca de avatar (URL ou upload) */}
      <AvatarDialog
        open={avatarOpen}
        onOpenChange={setAvatarOpen}
        player={player}
        onAvatarChanged={(avatarUrl) => {
          // marca a troca local: polling atrasado não pode desfazê-la
          avatarTouchedRef.current = { url: avatarUrl, at: Date.now() };
          setPlayer((prev) => (prev ? { ...prev, avatarUrl } : prev));
        }}
      />

      {/* Dialog salvar guerreiro (convidado → conta) */}
      {auth?.isGuest && (
        <SaveWarriorDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          onSaved={(account, chars) => {
            setAuth(account);
            setCharacters(chars);
            toast({
              title: '💾 Progresso salvo!',
              description: 'Seu guerreiro agora está garantido na sua conta.',
              className: 'border-emerald-600 bg-emerald-950 text-emerald-100',
            });
          }}
        />
      )}
    </main>
  );
}
