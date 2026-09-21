'use client';

// =====================================================================
// PAINEL DE ADMINISTRADOR (v0.9.6) — SÓ PARA A CONTA ADMIN
// ---------------------------------------------------------------------
// Este componente é montado APENAS quando a RPC is_admin() (Supabase)
// confirmou que a conta logada é a administradora. Para qualquer outro
// usuário ele simplesmente não existe: não é renderizado, o atalho F2
// não é registrado e o botão do escudo não aparece.
//
// v0.9.6 (Mudança 4): o painel lista PERSONAGENS (nome, raça, nível,
// poder) — o e-mail da conta dona aparece apenas como informação. TODAS
// as ações agem sobre o personagem escolhido: dar zenni/diamantes/
// esferas, editar atributos, dar XP/nível, restaurar energia, completar
// profissão/treinamento, dar itens/auras/cosméticos/transformações e
// resetar o progresso (DAQUELE personagem).
//
// As rotas /api/admin/* revalidam a identidade no SUPABASE (security
// definer) antes de tocar em qualquer dado. Aqui não há poder algum —
// apenas interface.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseSession } from '@/lib/supabase/client';
import type { AdminCharacterRow } from '@/lib/game/adminActions';
import type { AdminGuildRow, AdminActionLogView } from '@/lib/game/adminErasure';
import {
  SHOP_ITEMS,
  CRAFTED_ITEMS,
  CRAFT_STACK_ITEMS,
  PROFESSION_MATERIALS,
  COSMETICS,
  TRANSFORMATIONS,
  RACES,
} from '@/lib/game/constants';
import { RACE_EMOJI } from './Bits';
import {
  Shield,
  X,
  Search,
  RefreshCw,
  Coins,
  Gem,
  CircleDot,
  Star,
  HeartPulse,
  FastForward,
  Trash2,
  ChevronDown,
  Backpack,
  Sparkles,
  Wand2,
  Cloud,
  Bomb,
  Users,
  ScrollText,
  MessagesSquare,
  Lock,
  AlertTriangle,
  Skull,
} from 'lucide-react';

const inputClass =
  'w-24 bg-black/50 border border-amber-800/60 rounded-lg px-2 py-1.5 text-amber-100 text-sm focus:outline-none focus:border-orange-500 tabular-nums';

function num(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v.replace(',', '.'));
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

const selectClass =
  'bg-black/50 border border-amber-800/60 rounded-lg px-2 py-1.5 text-amber-100 text-sm focus:outline-none focus:border-orange-500 max-w-[220px]';

interface AdminDragonBallWorldRow {
  star: number;
  playerId: string | null;
  playerName: string | null;
}

export function AdminPanel({ onSelfModified }: { onSelfModified?: () => void }) {
  const [open, setOpen] = useState(false);
  // v0.14 — abas: personagens (tudo que existia) · guildas · auditoria
  const [tab, setTab] = useState<'personagens' | 'guildas' | 'auditoria' | 'chat'>('personagens');
  // v0.14 — autorização por E-MAIL no cliente (a segurança real é o backend;
  // aqui só ESCONDO os botões destrutivos de quem não é a conta principal)
  const [adminEmailOk, setAdminEmailOk] = useState(false);
  const [characters, setCharacters] = useState<AdminCharacterRow[] | null>(null);
  const [cloudAvailable, setCloudAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // v0.9.10: reset GERAL do servidor (zona de perigo)
  const [resetText, setResetText] = useState('');
  const [resetWorking, setResetWorking] = useState(false);
  const [resetResult, setResetResult] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [threatWorking, setThreatWorking] = useState(false);
  const [threatResult, setThreatResult] = useState<string | null>(null);
  // campos de formulário
  const [fZeni, setFZeni] = useState('');
  const [fCrys, setFCrys] = useState('');
  const [fXp, setFXp] = useState('');
  const [sStr, setSStr] = useState('');
  const [sDef, setSDef] = useState('');
  const [sSpd, setSSpd] = useState('');
  const [sKi, setSKi] = useState('');
  const [pLevel, setPLevel] = useState('');
  const [pXp, setPXp] = useState('');
  // concessões de catálogo (v0.9.6)
  const [gItem, setGItem] = useState('');
  const [gCosmetic, setGCosmetic] = useState('');
  const [gTransform, setGTransform] = useState('');
  const [gBallStar, setGBallStar] = useState('');
  const [gMaterial, setGMaterial] = useState('');
  const [gMaterialQty, setGMaterialQty] = useState('1');
  const [gCrafted, setGCrafted] = useState('');
  const [gCraftedQty, setGCraftedQty] = useState('1');
  const [dragonBallWorld, setDragonBallWorld] = useState<AdminDragonBallWorldRow[]>([]);
  // v0.14 — GUILDAS (lista + exclusão) e AUDITORIA
  const [guilds, setGuilds] = useState<AdminGuildRow[] | null>(null);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AdminActionLogView[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  // v0.14 — exclusão de personagem (confirmação dupla + resultado)
  // O alvo é FOTOGRAFADO ao abrir o modal (snapshot): após o sucesso a
  // lista é recarregada e `selected` muda/nullifica — o relatório da
  // operação precisa continuar VISÍVEL até o admin fechar.
  const [deleteCharOpen, setDeleteCharOpen] = useState(false);
  const [deleteCharTarget, setDeleteCharTarget] = useState<AdminCharacterRow | null>(null);
  const [deleteCharText, setDeleteCharText] = useState('');
  const [deleteCharWorking, setDeleteCharWorking] = useState(false);
  const [deleteCharResult, setDeleteCharResult] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  // v0.14 — exclusão de guilda
  const [deleteGuildTarget, setDeleteGuildTarget] = useState<AdminGuildRow | null>(null);
  const [deleteGuildText, setDeleteGuildText] = useState('');
  const [deleteGuildWorking, setDeleteGuildWorking] = useState(false);
  const [deleteGuildResult, setDeleteGuildResult] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  // Chat: histórico persistente só pode ser limpo por comando explícito aqui.
  const [chatClearText, setChatClearText] = useState('');
  const [chatClearWorking, setChatClearWorking] = useState(false);
  const [chatClearResult, setChatClearResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // v0.14 — resolve o e-mail da sessão UMA vez (esconde botões destrutivos
  // de admins que não sejam a conta principal; o backend revalida sempre)
  useEffect(() => {
    let alive = true;
    getSupabaseSession()
      .then(async (session) => {
        if (!session?.access_token) { if (alive) setAdminEmailOk(false); return; }
        const response = await fetch('/api/admin/capabilities', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
        if (alive) setAdminEmailOk(response.ok);
      })
      .catch(() => {
        if (alive) setAdminEmailOk(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // ===== atalho F2 (registrado apenas porque este componente existe) =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const session = await getSupabaseSession();
    if (!session) return null;
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  }, []);

  const fetchCharacters = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setStatus({ kind: 'err', text: 'Sessão expirada — entre de novo.' });
        return;
      }
      const res = await fetch('/api/admin/players', { headers, cache: 'no-store' });
      if (!res.ok) {
        setStatus({ kind: 'err', text: 'Não foi possível carregar a lista.' });
        return;
      }
      const data = await res.json();
      setCharacters(Array.isArray(data.characters) ? data.characters : []);
      setDragonBallWorld(Array.isArray(data.dragonBallWorld) ? data.dragonBallWorld : []);
      setCloudAvailable(data.cloudAvailable !== false);
    } catch {
      setStatus({ kind: 'err', text: 'Falha de conexão.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  // carrega a lista ao abrir
  useEffect(() => {
    if (open && characters === null) fetchCharacters();
  }, [open, characters, fetchCharacters]);

  const selected = useMemo(
    () => characters?.find((c) => c.id === selectedId) ?? null,
    [characters, selectedId]
  );
  const selectedCraftedItem = useMemo(
    () => CRAFTED_ITEMS.find((item) => item.id === gCrafted) ?? null,
    [gCrafted]
  );

  const prefillStats = useCallback((c: AdminCharacterRow | null) => {
    setSStr(c ? String(c.strength) : '');
    setSDef(c ? String(c.defense) : '');
    setSSpd(c ? String(c.speed) : '');
    setSKi(c ? String(c.ki) : '');
    setPLevel(c ? String(c.level) : '');
    setPXp('');
  }, []);

  useEffect(() => {
    prefillStats(selected);
    setConfirmReset(false);
    setGBallStar('');
    setGMaterial('');
    setGMaterialQty('1');
    setGCrafted('');
    setGCraftedQty('1');
  }, [selected?.id, prefillStats, selected]);

  const runAction = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!selected || working) return;
      setWorking(true);
      setStatus(null);
      try {
        const headers = await authHeaders();
        if (!headers) {
          setStatus({ kind: 'err', text: 'Sessão expirada — entre de novo.' });
          return;
        }
        const res = await fetch('/api/admin/action', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            characterId: selected.id,
            ownerId: selected.ownerKey,
            ...payload,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.success === false) {
          setStatus({ kind: 'err', text: data.error?.message ?? 'Ação recusada.' });
          return;
        }
        setStatus({ kind: 'ok', text: data.message });
        setFZeni('');
        setFCrys('');
        setFXp('');
        setPXp('');
        setGItem('');
        setGCosmetic('');
        setGTransform('');
        setGBallStar('');
        setGMaterial('');
        setGMaterialQty('1');
        setGCrafted('');
        setGCraftedQty('1');
        onSelfModified?.();
        await fetchCharacters();
      } catch {
        setStatus({ kind: 'err', text: 'Falha de conexão.' });
      } finally {
        setWorking(false);
      }
    },
    [selected, working, authHeaders, fetchCharacters, onSelfModified]
  );

  // ===== v0.9.10: RESET GERAL do servidor (backup automático + wipe) =====
  const runServerReset = useCallback(async () => {
    if (resetWorking) return;
    if (resetText.trim() !== 'RESET') {
      setResetResult({ kind: 'err', text: 'Digite RESET (maiúsculo) para habilitar o botão.' });
      return;
    }
    setResetWorking(true);
    setResetResult(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setResetResult({ kind: 'err', text: 'Sessão expirada — entre de novo.' });
        return;
      }
      const res = await fetch('/api/admin/reset-server', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirm: 'RESET' }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setResetResult({ kind: 'err', text: data.error?.message ?? 'Reset recusado.' });
        return;
      }
      const r = data.report;
      const wiped: Record<string, number> = r?.wiped ?? {};
      const resumo = Object.entries(wiped)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(' · ');
      const nuvem = data.cloud?.report;
      const resumoNuvem = nuvem
        ? ` Nuvem: ${nuvem.personagens_apagados} personagem(ns) apagado(s), ${nuvem.perfis_limpos} perfil(is) limpo(s) — backup da nuvem: personagens_backup_reset (${nuvem.backup_personagens} linhas).`
        : '';
      // v0.9.10.1: nuvem não limpa → AVISO alto (reset parcial), nunca silêncio
      if (data.cloudOk === false) {
        setResetResult({
          kind: 'warn',
          text: `${data.message} — apagado no servidor: ${resumo || 'nada'}. Temporada nova: ${r?.seasonName ?? '?'}.`,
        });
      } else {
        setResetResult({
          kind: 'ok',
          text:
            `${data.message} — apagado no servidor: ${resumo || 'nada'}. Temporada nova: ${r?.seasonName ?? '?'}. ` +
            `Avatares locais removidos: ${r?.avatarsDeleted ?? 0}${r?.avatarFailures ? ` (falhas: ${r.avatarFailures})` : ''}.${resumoNuvem}`,
        });
      }
      setResetText('');
      onSelfModified?.();
      await fetchCharacters();
    } catch {
      setResetResult({ kind: 'err', text: 'Falha de conexão durante o reset — verifique e tente de novo.' });
    } finally {
      setResetWorking(false);
    }
  }, [resetWorking, resetText, authHeaders, fetchCharacters, onSelfModified]);

  const invokeUniversalThreat = useCallback(async () => {
    if (threatWorking) return;
    setThreatWorking(true);
    setThreatResult(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setThreatResult('Sessão expirada — entre de novo.');
        return;
      }
      const res = await fetch('/api/admin/universal-threat', { method: 'POST', headers });
      const data = await res.json();
      setThreatResult(res.ok && data.success !== false ? data.message : data.error?.message ?? 'Invocação recusada.');
    } catch {
      setThreatResult('Falha de conexão ao invocar a Ameaça Universal.');
    } finally {
      setThreatWorking(false);
    }
  }, [threatWorking, authHeaders]);

  const filtered = useMemo(() => {
    if (!characters) return [];
    const q = search.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.ownerEmail ?? '').toLowerCase().includes(q) ||
        (c.ownerNick ?? '').toLowerCase().includes(q)
    );
  }, [characters, search]);

  // ===== v0.14: GUILDAS — lista com inventário =====
  const fetchGuilds = useCallback(async () => {
    setGuildsLoading(true);
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch('/api/admin/guilds', { headers, cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setGuilds(Array.isArray(data.guilds) ? data.guilds : []);
    } catch {
      // silencioso: a aba mostra o estado que tiver
    } finally {
      setGuildsLoading(false);
    }
  }, [authHeaders]);

  // ===== v0.14: AUDITORIA — log de ações administrativas =====
  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const headers = await authHeaders();
      if (!headers) return;
      const res = await fetch('/api/admin/audit-log?limit=50', { headers, cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setAuditLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      // silencioso
    } finally {
      setAuditLoading(false);
    }
  }, [authHeaders]);

  // carrega a aba quando ela abre (e ainda não tem dados)
  useEffect(() => {
    if (!open) return;
    if (tab === 'guildas' && guilds === null) fetchGuilds();
    if (tab === 'auditoria' && auditLogs === null) fetchAuditLogs();
  }, [open, tab, guilds, auditLogs, fetchGuilds, fetchAuditLogs]);

  // ===== v0.14: EXCLUSÃO DE PERSONAGEM (confirmação dupla já feita) =====
  const runDeleteCharacter = useCallback(async () => {
    const target = deleteCharTarget;
    if (!target || deleteCharWorking) return;
    setDeleteCharWorking(true);
    setDeleteCharResult(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setDeleteCharResult({ kind: 'err', text: 'Sessão expirada — entre de novo.' });
        return;
      }
      const res = await fetch('/api/admin/delete-character', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          characterId: target.id,
          ownerId: target.ownerKey,
          confirmName: deleteCharText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setDeleteCharResult({ kind: 'err', text: data.error?.message ?? 'Exclusão recusada.' });
        return;
      }
      const kind = data.status === 'ok' ? 'ok' : data.status === 'partial' ? 'warn' : 'err';
      setDeleteCharResult({ kind, text: data.message });
      if (data.status === 'ok') {
        setDeleteCharText('');
        setSelectedId(null);
        onSelfModified?.();
        await fetchCharacters();
        if (guilds !== null) await fetchGuilds();
        setAuditLogs(null); // força recarga na próxima visita à aba
      }
    } catch {
      setDeleteCharResult({ kind: 'err', text: 'Falha de conexão durante a exclusão.' });
    } finally {
      setDeleteCharWorking(false);
    }
  }, [deleteCharTarget, deleteCharWorking, deleteCharText, authHeaders, fetchCharacters, guilds, fetchGuilds, onSelfModified]);

  // ===== v0.14: EXCLUSÃO DE GUILDA (confirmação dupla já feita) =====
  const runDeleteGuild = useCallback(async () => {
    if (!deleteGuildTarget || deleteGuildWorking) return;
    setDeleteGuildWorking(true);
    setDeleteGuildResult(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setDeleteGuildResult({ kind: 'err', text: 'Sessão expirada — entre de novo.' });
        return;
      }
      const res = await fetch('/api/admin/delete-guild', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          guildId: deleteGuildTarget.id,
          confirmName: deleteGuildText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setDeleteGuildResult({ kind: 'err', text: data.error?.message ?? 'Exclusão recusada.' });
        return;
      }
      const kind = data.status === 'ok' ? 'ok' : data.status === 'partial' ? 'warn' : 'err';
      setDeleteGuildResult({ kind, text: data.message });
      if (data.status === 'ok') {
        setDeleteGuildText('');
        // o alvo PERMANECE no modal: o relatório da operação fica VISÍVEL
        // até o admin fechar (fechar = onClose, que limpa o alvo)
        onSelfModified?.();
        await fetchGuilds();
        await fetchCharacters();
        setAuditLogs(null);
      }
    } catch {
      setDeleteGuildResult({ kind: 'err', text: 'Falha de conexão durante a exclusão.' });
    } finally {
      setDeleteGuildWorking(false);
    }
  }, [deleteGuildTarget, deleteGuildWorking, deleteGuildText, authHeaders, fetchGuilds, fetchCharacters, onSelfModified]);

  const runClearChat = useCallback(async () => {
    if (chatClearWorking || chatClearText.trim() !== 'LIMPAR CHAT') return;
    setChatClearWorking(true);
    setChatClearResult(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setChatClearResult({ kind: 'err', text: 'Sessão expirada — entre de novo.' });
        return;
      }
      const res = await fetch('/api/admin/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirm: 'LIMPAR CHAT' }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setChatClearResult({ kind: 'err', text: data.error?.message ?? 'Limpeza recusada.' });
        return;
      }
      setChatClearResult({ kind: 'ok', text: data.message });
      setChatClearText('');
      setAuditLogs(null);
    } catch {
      setChatClearResult({ kind: 'err', text: 'Falha de conexão durante a limpeza do chat.' });
    } finally {
      setChatClearWorking(false);
    }
  }, [chatClearWorking, chatClearText, authHeaders]);


  // ===== botão do escudo (só existe para o admin) =====
  const floatingButton = (
    <button
      onClick={() => setOpen((o) => !o)}
      aria-label="Painel do administrador"
      title="Painel do administrador (F2)"
      className="fixed bottom-24 lg:bottom-6 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-b from-amber-400 to-orange-600 text-white border-2 border-yellow-300/80 shadow-lg shadow-orange-900/60 hover:from-amber-300 hover:to-orange-500 hover:scale-105 active:scale-95 transition-all font-heading text-sm"
      style={{ animation: 'admin-shield-pulse 2.2s ease-in-out infinite' }}
    >
      <Shield className="w-5 h-5" />
      <span className="hidden sm:inline">Admin</span>
    </button>
  );

  if (!open) return floatingButton;

  return (
    <>
      {floatingButton}
      {/* Overlay do painel — v0.9.11: SEM flex-centering vertical.
          O centramento flex clássico (items-center) + modal mais alto que
          a viewport joga o topo do modal para coordenadas negativas —
          região que o scroll NUNCA alcança (era a causa do header cortado,
          reativado quando as seções novas da loja/venda estouraram a
          altura da coluna de detalhes). Agora o modal ancora no topo,
          limitado à altura da viewport, com scroll INTERNO no corpo. */}
      <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm overflow-y-auto p-2 sm:p-4">
        {/* Modal: coluna flex — altura nunca ultrapassa a viewport
            (100dvh menos o padding do overlay); centrado apenas no eixo
            horizontal (mx-auto), que não sofre do bug de overflow. */}
        <div className="mx-auto w-full max-w-5xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col bg-[#16110b] border border-amber-800/50 rounded-2xl shadow-2xl shadow-black/60">
          {/* Cabeçalho — FORA da área de scroll (flex-none): fica visível
              e utilizável em QUALQUER viewport/zoom. Nunca mais corta. */}
          <div className="flex-none flex items-center justify-between gap-3 px-5 py-4 border-b border-amber-900/40 bg-[#16110b] rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <h2 className="font-heading text-lg text-amber-100">Painel do Administrador</h2>
              <span className="text-[10px] text-amber-200/40 border border-amber-900/50 rounded px-1.5 py-0.5 hidden sm:inline">
                F2 abre/fecha
              </span>
              {!cloudAvailable && (
                <span className="text-[10px] text-amber-300/70 border border-amber-700/50 rounded px-1.5 py-0.5 hidden sm:inline">
                  SQL v0.9.6 pendente — só personagens locais
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchCharacters}
                disabled={loading}
                className="p-2 rounded-lg bg-black/40 border border-amber-900/50 text-amber-200/70 hover:text-amber-100 disabled:opacity-50"
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg bg-black/40 border border-amber-900/50 text-amber-200/70 hover:text-amber-100"
                title="Fechar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* v0.14 — BARRA DE ABAS (flex-none, fora do scroll): personagens
              (tudo que existia) · guildas · ações administrativas */}
          <div className="flex-none flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2 border-b border-amber-900/40 bg-black/30 overflow-x-auto">
            {([
              ['personagens', 'Personagens', Shield],
              ['guildas', 'Guildas', Users],
              ['chat', 'Chat', MessagesSquare],
              ['auditoria', 'Ações admin', ScrollText],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-heading whitespace-nowrap transition-colors border touch-manipulation ${
                  tab === key
                    ? 'bg-gradient-to-r from-orange-900/60 to-amber-900/30 border-orange-600/60 text-amber-100'
                    : 'bg-black/30 border-transparent text-amber-200/50 hover:text-amber-100 hover:border-amber-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
            {!adminEmailOk && (
              <span className="ml-auto hidden sm:flex items-center gap-1 text-[10px] text-amber-200/40 whitespace-nowrap">
                <Lock className="w-3 h-3" /> exclusões somente para a conta autorizada
              </span>
            )}
          </div>

          {/* Corpo — ÚNICO ponto de scroll do painel (flex-1 min-h-0:
              a regra de ouro do flex-col com filho rolável). Tudo que
              for adicionado ao painel no futuro rola AQUI dentro, sem
              nunca empurrar o header para fora da tela. */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tab === 'guildas' ? (
              <GuildsTab
                guilds={guilds}
                loading={guildsLoading}
                adminEmailOk={adminEmailOk}
                onRefresh={fetchGuilds}
                onDelete={(g) => {
                  setDeleteGuildTarget(g);
                  setDeleteGuildText('');
                  setDeleteGuildResult(null);
                }}
              />
            ) : tab === 'chat' ? (
              <ChatAdminTab
                adminEmailOk={adminEmailOk}
                text={chatClearText}
                onText={setChatClearText}
                working={chatClearWorking}
                result={chatClearResult}
                onClear={runClearChat}
              />
            ) : tab === 'auditoria' ? (
              <AuditTab logs={auditLogs} loading={auditLoading} onRefresh={fetchAuditLogs} />
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
              {/* ===== Lista de PERSONAGENS (sem scroll próprio — o corpo
                  inteiro rola junto; nada de scroll aninhado) ===== */}
              <div className="border-b lg:border-b-0 lg:border-r border-amber-900/40 p-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/30" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar personagem ou e-mail"
                  className="w-full bg-black/40 border border-amber-900/50 rounded-lg pl-9 pr-3 py-2 text-sm text-amber-100 placeholder:text-amber-200/30 focus:outline-none focus:border-orange-500"
                />
              </div>
              {characters === null && loading && (
                <p className="text-sm text-amber-200/50 animate-pulse p-2">Carregando personagens...</p>
              )}
              <div className="space-y-1.5">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedId(c.id);
                      setStatus(null);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      selectedId === c.id
                        ? 'bg-gradient-to-r from-orange-900/50 to-amber-900/30 border-orange-600/60'
                        : 'bg-black/30 border-amber-900/40 hover:border-amber-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-heading text-sm text-amber-100 truncate">
                        {RACE_EMOJI[c.race] ?? '⚔️'} {c.name}
                      </span>
                      <span className="text-[11px] text-amber-200/50 tabular-nums shrink-0">Nv {c.level}</span>
                    </div>
                    <div className="text-[11px] text-amber-200/50 truncate flex items-center gap-1">
                      {c.source === 'cloud' && <Cloud className="w-3 h-3 shrink-0" aria-label="só na nuvem" />}
                      <span className="truncate" title={c.ownerEmail ?? c.ownerNick ?? 'sem conta'}>
                        {c.ownerEmail ?? c.ownerNick ?? 'sem conta'} · poder {c.power.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </button>
                ))}
                {characters !== null && filtered.length === 0 && (
                  <p className="text-sm text-amber-200/40 p-2">Nenhum personagem encontrado.</p>
                )}
              </div>
            </div>

            {/* ===== Detalhe + ações (tudo sobre o PERSONAGEM) ===== */}
            <div className="p-4 sm:p-5 space-y-5">
              {!selected ? (
                <p className="text-sm text-amber-200/50 py-8 text-center">
                  Selecione um personagem na lista para conceder itens e ajustes.
                </p>
              ) : (
                <>
                  {/* Cabeçalho do personagem */}
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-base text-amber-100">
                      {RACE_EMOJI[selected.race] ?? '⚔️'} {selected.name}
                    </h3>
                    <span className="text-[11px] text-amber-200/50">
                      {RACES[selected.race as keyof typeof RACES]?.name ?? selected.race} · Nv {selected.level} ·{' '}
                      {selected.source === 'local' ? 'no servidor' : 'só na nuvem'}
                    </span>
                  </div>
                  {selected.ownerEmail && (
                    <p className="text-[11px] text-amber-200/40 -mt-3 break-all" title={selected.ownerEmail}>
                      Conta dona: {selected.ownerEmail}
                      {selected.ownerNick ? ` (${selected.ownerNick})` : ''}
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-black/30 rounded-lg border border-amber-900/40 px-3 py-2">
                      <p className="text-amber-200/40 flex items-center gap-1"><Coins className="w-3 h-3" /> Zeni</p>
                      <p className="text-yellow-300 font-heading text-base tabular-nums">{selected.zeni.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="bg-black/30 rounded-lg border border-amber-900/40 px-3 py-2">
                      <p className="text-amber-200/40 flex items-center gap-1"><Gem className="w-3 h-3" /> Diamantes</p>
                      <p className="text-sky-300 font-heading text-base tabular-nums">{selected.crystals.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="bg-black/30 rounded-lg border border-amber-900/40 px-3 py-2">
                      <p className="text-amber-200/40 flex items-center gap-1"><CircleDot className="w-3 h-3" /> Esferas</p>
                      <p className="text-orange-300 font-heading text-base tabular-nums">{selected.dragonBalls}/7</p>
                    </div>
                    <div className="bg-black/30 rounded-lg border border-amber-900/40 px-3 py-2">
                      <p className="text-amber-200/40 flex items-center gap-1"><Star className="w-3 h-3" /> Nível / XP</p>
                      <p className="text-amber-100 font-heading text-base tabular-nums">{selected.level} · {selected.xp.toLocaleString('pt-BR')}</p>
                    </div>
                  </div>

                  {/* 1: conceder recursos */}
                  <section className="bg-black/20 rounded-xl border border-amber-900/40 p-4">
                    <h3 className="font-heading text-sm text-amber-100 mb-3 flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-yellow-500" /> Conceder recursos
                      <span className="text-[10px] text-amber-200/40 font-normal">(valores negativos removem)</span>
                    </h3>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-amber-200/60">
                        Zeni
                        <input value={fZeni} onChange={(e) => setFZeni(e.target.value)} inputMode="numeric" placeholder="+5000" className={`${inputClass} block mt-1`} />
                      </label>
                      <label className="text-xs text-amber-200/60">
                        Diamantes
                        <input value={fCrys} onChange={(e) => setFCrys(e.target.value)} inputMode="numeric" placeholder="+100" className={`${inputClass} block mt-1`} />
                      </label>
                      <label className="text-xs text-amber-200/60">
                        XP
                        <input value={fXp} onChange={(e) => setFXp(e.target.value)} inputMode="numeric" placeholder="+1000" className={`${inputClass} block mt-1`} />
                      </label>
                      <button
                        onClick={() =>
                          runAction({
                            action: 'grant',
                            zeniDelta: num(fZeni),
                            crystalDelta: num(fCrys),
                            xpGain: num(fXp),
                          })
                        }
                        disabled={working || (!fZeni && !fCrys && !fXp)}
                        className="px-4 py-2 rounded-lg bg-gradient-to-b from-orange-500 to-amber-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        Conceder
                      </button>
                    </div>
                  </section>

                  {/* 2: atributos */}
                  <section className="bg-black/20 rounded-xl border border-amber-900/40 p-4">
                    <h3 className="font-heading text-sm text-amber-100 mb-3 flex items-center gap-1.5">
                      <ChevronDown className="w-4 h-4 text-orange-400" /> Editar atributos
                      <span className="text-[10px] text-amber-200/40 font-normal">(define o valor final)</span>
                    </h3>
                    <div className="flex flex-wrap items-end gap-3">
                      {([
                        ['Força', sStr, setSStr],
                        ['Defesa', sDef, setSDef],
                        ['Velocidade', sSpd, setSSpd],
                        ['Ki', sKi, setSKi],
                      ] as Array<[string, string, (v: string) => void]>).map(([label, val, set]) => (
                        <label key={label} className="text-xs text-amber-200/60">
                          {label}
                          <input value={val} onChange={(e) => set(e.target.value)} inputMode="numeric" className={`${inputClass} block mt-1`} />
                        </label>
                      ))}
                      <button
                        onClick={() =>
                          runAction({
                            action: 'set_stats',
                            strength: num(sStr),
                            defense: num(sDef),
                            speed: num(sSpd),
                            ki: num(sKi),
                          })
                        }
                        disabled={working}
                        className="px-4 py-2 rounded-lg bg-gradient-to-b from-orange-500 to-amber-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        Aplicar
                      </button>
                    </div>
                  </section>

                  {/* 3: nível / XP */}
                  <section className="bg-black/20 rounded-xl border border-amber-900/40 p-4">
                    <h3 className="font-heading text-sm text-amber-100 mb-3 flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-orange-300" /> Nível e XP
                      <span className="text-[10px] text-amber-200/40 font-normal">(define o valor final)</span>
                    </h3>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-amber-200/60">
                        Nível
                        <input value={pLevel} onChange={(e) => setPLevel(e.target.value)} inputMode="numeric" className={`${inputClass} block mt-1`} />
                      </label>
                      <label className="text-xs text-amber-200/60">
                        XP
                        <input value={pXp} onChange={(e) => setPXp(e.target.value)} inputMode="numeric" placeholder="0" className={`${inputClass} block mt-1`} />
                      </label>
                      <button
                        onClick={() => runAction({ action: 'set_progress', level: num(pLevel), xp: num(pXp) })}
                        disabled={working || (pLevel === '' && pXp === '')}
                        className="px-4 py-2 rounded-lg bg-gradient-to-b from-orange-500 to-amber-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        Aplicar
                      </button>
                    </div>
                  </section>

                  {/* Esferas globais: a estrela é única no mundo */}
                  <section className="bg-black/20 rounded-xl border border-amber-900/40 p-4">
                    <h3 className="font-heading text-sm text-amber-100 mb-2 flex items-center gap-1.5">
                      <CircleDot className="w-4 h-4 text-orange-300" /> Conceder Esfera do Dragão
                    </h3>
                    <p className="text-[11px] text-amber-200/45 mb-3">
                      Cada estrela existe uma única vez no mundo. Estrelas já possuídas por outro guerreiro aparecem bloqueadas.
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-amber-200/60 flex-1 min-w-[220px]">
                        Estrela específica
                        <select
                          value={gBallStar}
                          onChange={(e) => setGBallStar(e.target.value)}
                          className={`${selectClass} block mt-1 w-full`}
                        >
                          <option value="">— escolher —</option>
                          {Array.from({ length: 7 }, (_, index) => index + 1).map((star) => {
                            const world = dragonBallWorld.find((ball) => ball.star === star);
                            const owner = world?.playerName ?? null;
                            const isMine = world?.playerId === selected.id;
                            return (
                              <option key={star} value={star} disabled={!!world?.playerId}>
                                ⭐ {star} estrela{star === 1 ? '' : 's'} — {isMine ? `já com ${selected.name}` : owner ? `com ${owner}` : 'livre'}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <button
                        onClick={() => runAction({ action: 'grant_dragon_ball', dragonBallStar: Number(gBallStar) })}
                        disabled={working || !gBallStar || selected.source !== 'local'}
                        className="px-4 py-2 rounded-lg bg-gradient-to-b from-orange-500 to-amber-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        Conceder estrela
                      </button>
                    </div>
                    {selected.source !== 'local' && (
                      <p className="text-[11px] text-orange-200/55 mt-2">
                        Este personagem está apenas na nuvem. Esferas globais só podem ser atribuídas quando ele estiver carregado no servidor atual.
                      </p>
                    )}
                  </section>

                  {/* Recursos exclusivos da Oficina */}
                  <section className="bg-black/20 rounded-xl border border-emerald-900/40 p-4 space-y-3">
                    <h3 className="font-heading text-sm text-amber-100 flex items-center gap-1.5">
                      <Backpack className="w-4 h-4 text-emerald-400" /> Recursos da Oficina
                    </h3>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-amber-200/60 flex-1 min-w-[220px]">
                        Material / projeto
                        <select value={gMaterial} onChange={(e) => setGMaterial(e.target.value)} className={`${selectClass} block mt-1 w-full`}>
                          <option value="">— escolher —</option>
                          <optgroup label="Materiais profissionais">
                            {PROFESSION_MATERIALS.map((m) => (
                              <option key={m.id} value={m.id}>{m.icon} {m.name} (T{m.tier})</option>
                            ))}
                          </optgroup>
                          <optgroup label="Projetos / blueprints">
                            {CRAFT_STACK_ITEMS.map((m) => (
                              <option key={m.id} value={m.id}>{m.icon} {m.name} (T{m.tier})</option>
                            ))}
                          </optgroup>
                        </select>
                      </label>
                      <label className="text-xs text-amber-200/60">
                        Qtd.
                        <input
                          value={gMaterialQty}
                          onChange={(e) => setGMaterialQty(e.target.value)}
                          inputMode="numeric"
                          className={`${inputClass} block mt-1`}
                        />
                      </label>
                      <button
                        onClick={() => runAction({ action: 'grant_craft_material', materialId: gMaterial, quantity: num(gMaterialQty) ?? 1 })}
                        disabled={working || !gMaterial}
                        className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        Conceder material
                      </button>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-amber-200/60 flex-1 min-w-[220px]">
                        Item exclusivo de crafting
                        <select value={gCrafted} onChange={(e) => { setGCrafted(e.target.value); setGCraftedQty('1'); }} className={`${selectClass} block mt-1 w-full`}>
                          <option value="">— escolher —</option>
                          {CRAFTED_ITEMS.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.icon} {item.name} ({item.category === 'consumable' ? 'consumível' : item.category})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-amber-200/60">
                        Qtd.
                        <input
                          value={gCraftedQty}
                          onChange={(e) => setGCraftedQty(e.target.value)}
                          inputMode="numeric"
                          disabled={selectedCraftedItem?.category !== 'consumable'}
                          className={`${inputClass} block mt-1 disabled:opacity-40`}
                        />
                      </label>
                      <button
                        onClick={() => runAction({ action: 'grant_crafted_item', craftedItemId: gCrafted, quantity: num(gCraftedQty) ?? 1 })}
                        disabled={working || !gCrafted}
                        className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        Conceder item de craft
                      </button>
                    </div>
                  </section>

                  {/* 4: dar item / cosmético / transformação (v0.9.6) */}
                  <section className="bg-black/20 rounded-xl border border-amber-900/40 p-4 space-y-3">
                    <h3 className="font-heading text-sm text-amber-100 flex items-center gap-1.5">
                      <Backpack className="w-4 h-4 text-emerald-400" /> Dar item, aura/cosmético ou transformação
                    </h3>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-amber-200/60 flex-1 min-w-[200px]">
                        Item da loja
                        <select value={gItem} onChange={(e) => setGItem(e.target.value)} className={`${selectClass} block mt-1 w-full`}>
                          <option value="">— escolher —</option>
                          {SHOP_ITEMS.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.icon} {i.name} ({i.category === 'consumable' ? 'consumível' : i.category})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => runAction({ action: 'grant_item', itemId: gItem })}
                        disabled={working || !gItem}
                        className="px-4 py-2 rounded-lg bg-gradient-to-b from-orange-500 to-amber-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        Dar item
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-amber-200/60 flex-1 min-w-[200px]">
                        Aura / cosmético
                        <select value={gCosmetic} onChange={(e) => setGCosmetic(e.target.value)} className={`${selectClass} block mt-1 w-full`}>
                          <option value="">— escolher —</option>
                          {COSMETICS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.icon} {c.name} ({c.slot})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => runAction({ action: 'grant_cosmetic', cosmeticId: gCosmetic })}
                        disabled={working || !gCosmetic}
                        className="px-4 py-2 rounded-lg bg-gradient-to-b from-orange-500 to-amber-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        <Sparkles className="w-4 h-4 inline mr-1" /> Dar
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-amber-200/60 flex-1 min-w-[200px]">
                        Transformação
                        <select value={gTransform} onChange={(e) => setGTransform(e.target.value)} className={`${selectClass} block mt-1 w-full`}>
                          <option value="">— escolher —</option>
                          {TRANSFORMATIONS.filter((t) => t.race === 'any' || t.race === selected.race).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.icon} {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => runAction({ action: 'grant_transformation', transformationId: gTransform })}
                        disabled={working || !gTransform}
                        className="px-4 py-2 rounded-lg bg-gradient-to-b from-orange-500 to-amber-700 text-white text-sm font-heading disabled:opacity-40"
                      >
                        <Wand2 className="w-4 h-4 inline mr-1" /> Desbloquear
                      </button>
                    </div>
                  </section>

                  {/* Ferramentas de suporte operacional */}
                  <section className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => runAction({ action: 'restore_energy' })}
                        disabled={working}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-950/40 border border-amber-800/50 text-amber-100 text-sm font-heading hover:border-amber-600/60 disabled:opacity-40"
                      >
                        <HeartPulse className="w-4 h-4 text-amber-400" /> Restaurar energia
                      </button>
                      <button
                        onClick={() => runAction({ action: 'restore_health' })}
                        disabled={working}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-950/30 border border-red-800/50 text-red-100 text-sm font-heading hover:border-red-600/60 disabled:opacity-40"
                      >
                        <HeartPulse className="w-4 h-4 text-red-400" /> Restaurar vida
                      </button>
                      <button
                        onClick={() => runAction({ action: 'accelerate_activity' })}
                        disabled={working}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-950/40 border border-sky-800/50 text-sky-100 text-sm font-heading hover:border-sky-600/60 disabled:opacity-40"
                      >
                        <FastForward className="w-4 h-4 text-sky-400" /> Acelerar atividade
                      </button>
                    </div>
                    <p className="text-[11px] text-sky-200/45">
                      Acelera imediatamente trabalho, batalha/PvP/torneio, Busca pelas Esferas e fabricação em andamento. Recompensas continuam sendo resolvidas/coletadas pelo fluxo normal.
                    </p>
                  </section>

                  {/* 7: resetar (perigoso — SÓ ESTE personagem) */}
                  <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-4">
                    <h3 className="font-heading text-sm text-red-200 mb-1 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4 text-red-400" /> Zona de risco
                    </h3>
                    <p className="text-[11px] text-red-200/60 leading-relaxed mb-2">
                      O reset é SÓ de <b>{selected.name}</b> (os outros personagens da conta não mudam). Ele NÃO apaga o
                      personagem: volta ao <b>estado de criação</b> preservando apenas <b>nome e raça</b> — cosméticos
                      comprados, avatar, diamantes, itens, equipamentos, auras, transformações, conquistas, missões,
                      profissão e dano na Ameaça Universal atual são <b>zerados</b>.
                    </p>
                    {confirmReset ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => runAction({ action: 'reset' })}
                          disabled={working}
                          className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-heading disabled:opacity-40"
                        >
                          Confirmar reset de {selected.name}
                        </button>
                        <button
                          onClick={() => setConfirmReset(false)}
                          className="px-3 py-2 rounded-lg bg-black/40 border border-amber-900/50 text-amber-200/70 text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmReset(true)}
                        disabled={working}
                        className="px-4 py-2 rounded-lg bg-black/40 border border-red-900/50 text-red-300 text-sm font-heading hover:border-red-700 disabled:opacity-40"
                      >
                        Resetar progresso de {selected.name}
                      </button>
                    )}
                  </section>

                  {/* ===== v0.14: EXCLUSÃO PERMANENTE do personagem ===== */}
                  <section className="rounded-xl border-2 border-red-800/70 bg-red-950/30 p-4">
                    <h3 className="font-heading text-sm text-red-200 mb-1 flex items-center gap-1.5">
                      <Skull className="w-4 h-4 text-red-400" /> Exclusão permanente — apaga o personagem
                    </h3>
                    <p className="text-[11px] text-red-200/60 leading-relaxed mb-2">
                      Diferente do reset: <b>{selected.name} deixa de existir</b> — no servidor E na nuvem (mesma
                      operação, com backup na nuvem). Some do ranking em todas as categorias, das listas e do
                      próximo login do dono. Ações, missões, conquistas, dano a chefes e ledger dele são varridos
                      pelo cascade; a verificação anti-órfã roda na hora. Bots e o SEU personagem são bloqueados.
                      {selected.isGuildLeader && selected.guildName && (
                        <b className="block mt-1 text-red-300">
                          ⚠️ {selected.name} é LÍDER da guilda “{selected.guildName}”
                          {selected.guildMemberCount ? ` (${selected.guildMemberCount} membro(s))` : ''} — excluir o
                          líder DISSOLVE a guilda por completo (erasure total: cargos, convites, solicitações e
                          histórico de doações; membros ficam sem guilda).
                        </b>
                      )}
                    </p>
                    {adminEmailOk ? (
                      <button
                        onClick={() => {
                          setDeleteCharOpen(true);
                          setDeleteCharTarget(selected);
                          setDeleteCharText('');
                          setDeleteCharResult(null);
                        }}
                        disabled={working}
                        className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg bg-black/40 border border-red-800/60 text-red-300 text-sm font-heading hover:border-red-600 hover:bg-red-950/40 disabled:opacity-40 touch-manipulation"
                      >
                        <Trash2 className="w-4 h-4" /> Excluir personagem permanentemente
                      </button>
                    ) : (
                      <p className="text-[11px] text-red-200/40 flex items-center gap-1.5">
                        <Lock className="w-3 h-3" /> Exclusão disponível apenas para a conta autorizada.
                      </p>
                    )}
                  </section>
                </>
              )}

              {/* ===== v0.9.10: RESET GERAL DO SERVIDOR (ação global) ===== */}
              <section className="rounded-xl border border-orange-800/60 bg-orange-950/20 p-4">
                <h3 className="font-heading text-sm text-orange-200 mb-1 flex items-center gap-1.5">
                  <Skull className="w-4 h-4 text-orange-400" /> Ameaça Universal
                </h3>
                <p className="text-[11px] text-orange-200/70 leading-relaxed mb-3">
                  A ameaça aparece aos finais de semana. O administrador pode invocá-la por 24 horas durante a semana.
                </p>
                <button
                  onClick={invokeUniversalThreat}
                  disabled={threatWorking}
                  className="px-4 py-2 rounded-lg bg-orange-700 hover:bg-orange-600 text-white text-sm font-heading disabled:opacity-40"
                >
                  {threatWorking ? 'Invocando…' : 'Invocar Ameaça Universal'}
                </button>
                {threatResult && <p role="status" className="mt-2 text-xs text-orange-200">{threatResult}</p>}
              </section>

              <section className="rounded-xl border-2 border-red-800/60 bg-red-950/25 p-4">
                <h3 className="font-heading text-sm text-red-200 mb-1 flex items-center gap-1.5">
                  <Bomb className="w-4 h-4 text-red-400" /> Reset geral do servidor — apaga TUDO
                </h3>
                <p className="text-[11px] text-red-200/70 leading-relaxed mb-3">
                  Apaga <b>todos os personagens, contas locais, inventários, conquistas, missões, guildas, carteiras,
                  temporada e a Ameaça Universal</b> deste servidor do jogo (backup automático do banco é salvo antes,
                  com o caminho exibido no resultado). <b>Apaga também os personagens da NUVEM</b> (Supabase) com
                  backup em tabelas <code>*_backup_reset</code> — sem isso eles voltariam no próximo login. Contas de
                  login, admins e catálogos <b>não</b> são tocados. Bots de PvP são recriados automaticamente. Requer a
                  RPC <code>admin_reset_cloud</code> instalada no Supabase (SQL único, uma vez só — se faltar, o
                  resultado avisa com a instrução exata).
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={resetText}
                    onChange={(e) => setResetText(e.target.value)}
                    placeholder="digite RESET para confirmar"
                    disabled={resetWorking}
                    className="flex-1 min-w-40 bg-black/60 border border-red-900/60 rounded-lg px-3 py-2 text-red-100 text-sm tracking-widest uppercase focus:outline-none focus:border-red-500"
                    aria-label="Confirmação do reset geral"
                  />
                  <button
                    onClick={runServerReset}
                    disabled={resetWorking || resetText.trim() !== 'RESET'}
                    className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-heading disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {resetWorking ? 'Resetando…' : 'Apagar tudo e recomeçar'}
                  </button>
                </div>
                {resetResult && (
                  <p
                    role="status"
                    className={`mt-2 text-xs leading-relaxed rounded-lg px-3 py-2 border whitespace-pre-wrap break-all ${
                      resetResult.kind === 'ok'
                        ? 'text-emerald-300 border-emerald-800/50 bg-emerald-950/30'
                        : resetResult.kind === 'warn'
                          ? 'text-amber-300 border-amber-800/50 bg-amber-950/30'
                          : 'text-red-300 border-red-800/50 bg-red-950/30'
                    }`}
                  >
                    {resetResult.text}
                  </p>
                )}
              </section>

              {/* Status da última ação */}
              {status && (
                <p
                  role="status"
                  className={`text-sm leading-relaxed rounded-lg px-3 py-2 border ${
                    status.kind === 'ok'
                      ? 'text-emerald-300 border-emerald-800/50 bg-emerald-950/30'
                      : 'text-red-300 border-red-800/50 bg-red-950/30'
                  }`}
                >
                  {status.text}
                </p>
              )}
            </div>
            </div>
            )}
          {/* fecha o corpo rolável (flex-1 min-h-0 overflow-y-auto) */}
          </div>
        </div>
      </div>

      {/* ===== v0.14: MODAIS DE CONFIRMAÇÃO DUPLA (acima do painel) ===== */}
      <DeleteCharacterModal
        target={deleteCharOpen ? deleteCharTarget : null}
        adminEmailOk={adminEmailOk}
        text={deleteCharText}
        onText={setDeleteCharText}
        working={deleteCharWorking}
        result={deleteCharResult}
        onConfirm={runDeleteCharacter}
        onClose={() => {
          setDeleteCharOpen(false);
          setDeleteCharTarget(null);
          setDeleteCharText('');
          setDeleteCharResult(null);
        }}
      />
      <DeleteGuildModal
        target={deleteGuildTarget}
        text={deleteGuildText}
        onText={setDeleteGuildText}
        working={deleteGuildWorking}
        result={deleteGuildResult}
        onConfirm={runDeleteGuild}
        onClose={() => {
          setDeleteGuildTarget(null);
          setDeleteGuildText('');
          setDeleteGuildResult(null);
        }}
      />
    </>
  );
}

// =====================================================================
// CHAT — limpeza explícita do histórico persistente
// =====================================================================

function ChatAdminTab({
  adminEmailOk,
  text,
  onText,
  working,
  result,
  onClear,
}: {
  adminEmailOk: boolean;
  text: string;
  onText: (value: string) => void;
  working: boolean;
  result: { kind: 'ok' | 'err'; text: string } | null;
  onClear: () => void;
}) {
  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="font-heading text-base text-amber-100 flex items-center gap-2">
          <MessagesSquare className="w-5 h-5 text-amber-400" /> Administração do chat
        </h3>
        <p className="text-[11px] text-amber-200/50 mt-1 leading-relaxed">
          O histórico global, privado e de guilda vive no PostgreSQL e sobrevive a deploys, exclusões de personagens,
          dissolução de guildas e reset do mundo. Mensagens só são removidas por este comando administrativo.
          Preferências sociais (amigos, bloqueios e jogadores silenciados) não são apagadas por este comando.
        </p>
      </div>

      <section className="rounded-xl border-2 border-red-800/60 bg-red-950/25 p-4">
        <h4 className="font-heading text-sm text-red-200 mb-1 flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Limpar todo o histórico do chat
        </h4>
        <p className="text-[11px] text-red-200/70 leading-relaxed mb-3">
          Ação irreversível: remove mensagens dos três canais para todos os jogadores. A operação fica registrada em
          <b> Ações admin</b>.
        </p>
        {adminEmailOk ? (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                value={text}
                onChange={(e) => onText(e.target.value)}
                placeholder="digite LIMPAR CHAT"
                disabled={working}
                className="flex-1 min-w-52 bg-black/60 border border-red-900/60 rounded-lg px-3 py-2 text-red-100 text-sm tracking-wide uppercase focus:outline-none focus:border-red-500"
              />
              <button
                onClick={onClear}
                disabled={working || text.trim() !== 'LIMPAR CHAT'}
                className="px-4 py-2.5 min-h-[44px] rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-heading disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {working ? 'Limpando…' : 'Limpar histórico do chat'}
              </button>
            </div>
            {result && (
              <p
                role="status"
                className={`mt-3 text-xs rounded-lg border px-3 py-2 ${
                  result.kind === 'ok'
                    ? 'text-emerald-300 border-emerald-800/50 bg-emerald-950/30'
                    : 'text-red-300 border-red-800/50 bg-red-950/30'
                }`}
              >
                {result.text}
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-red-200/40 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Limpeza disponível apenas para a conta administrativa autorizada.
          </p>
        )}
      </section>
    </div>
  );
}

// =====================================================================
// v0.14 — ABA GUILDAS (lista com inventário + botão de exclusão)
// =====================================================================

function GuildsTab({
  guilds,
  loading,
  adminEmailOk,
  onRefresh,
  onDelete,
}: {
  guilds: AdminGuildRow[] | null;
  loading: boolean;
  adminEmailOk: boolean;
  onRefresh: () => void;
  onDelete: (guild: AdminGuildRow) => void;
}) {
  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading text-base text-amber-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" /> Guildas do servidor
          </h3>
          <p className="text-[11px] text-amber-200/50 mt-0.5">
            A exclusão é o erasure total da regra vigente: linha, cargos, convites, solicitações e histórico de
            doações — o nome fica livre. Membros ficam sem guilda, íntegros.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2.5 min-h-[44px] rounded-lg bg-black/40 border border-amber-900/50 text-amber-200/70 hover:text-amber-100 disabled:opacity-50 touch-manipulation"
          title="Atualizar guildas"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {guilds === null && loading && (
        <p className="text-sm text-amber-200/50 animate-pulse p-2">Carregando guildas...</p>
      )}
      {guilds !== null && guilds.length === 0 && (
        <p className="text-sm text-amber-200/40 p-2">
          Nenhuma guilda ainda — o mundo começa com ZERO guildas; elas passam a existir quando jogadores as fundarem.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(guilds ?? []).map((g) => (
          <div
            key={g.id}
            className="rounded-xl border border-amber-900/40 bg-black/30 p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-heading text-sm text-amber-100 truncate flex items-center gap-1.5">
                  🛡️ {g.name}
                </h4>
                <p className="text-[11px] text-amber-200/50">
                  Nv {g.level} · líder {g.leaderName ?? '—'} · {g.memberCount} membro(s)
                  {g.onlineMembers.length > 0 && (
                    <span className="text-emerald-400/80"> · {g.onlineMembers.length} online</span>
                  )}
                </p>
              </div>
            </div>
            <div className="text-[11px] text-amber-200/60 leading-relaxed">
              Doações históricas: <b className="text-yellow-300">{g.totalDonated.toLocaleString('pt-BR')} Zeni</b>{' '}
              ({g.donationCount} registro(s)) · convites pendentes: {g.pendingInvites} · solicitações pendentes:{' '}
              {g.pendingRequests}
            </div>
            <div className="text-[11px] text-amber-200/40 truncate" title={g.memberNames.join(', ')}>
              Membros: {g.memberNames.join(', ') || '—'}
            </div>
            {adminEmailOk ? (
              <button
                onClick={() => onDelete(g)}
                className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg bg-black/40 border border-red-800/60 text-red-300 text-xs font-heading hover:border-red-600 hover:bg-red-950/40 touch-manipulation"
              >
                <Trash2 className="w-4 h-4" /> Excluir guilda
              </button>
            ) : (
              <p className="text-[10px] text-red-200/40 flex items-center gap-1.5 pt-1 border-t border-amber-900/40">
                <Lock className="w-3 h-3 shrink-0" /> Exclusão apenas para a conta principal.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// v0.14 — ABA AÇÕES ADMINISTRATIVAS (log de auditoria)
// =====================================================================

const RESULT_STYLES: Record<string, { label: string; cls: string }> = {
  ok: { label: 'concluída', cls: 'text-emerald-300 border-emerald-800/50 bg-emerald-950/30' },
  partial: { label: 'PARCIAL', cls: 'text-amber-300 border-amber-800/50 bg-amber-950/30' },
  failed: { label: 'FALHOU', cls: 'text-red-300 border-red-800/50 bg-red-950/30' },
  blocked: { label: 'bloqueada', cls: 'text-amber-200/70 border-amber-900/50 bg-black/40' },
};

function AuditTab({
  logs,
  loading,
  onRefresh,
}: {
  logs: AdminActionLogView[] | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading text-base text-amber-100 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-amber-400" /> Ações administrativas
          </h3>
          <p className="text-[11px] text-amber-200/50 mt-0.5">
            Cada exclusão (e cada tentativa bloqueada) registra: quando, quem, o alvo, as camadas e o resultado.
            Nada é apagado silenciosamente — falha parcial aparece como PARCIAL.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2.5 min-h-[44px] rounded-lg bg-black/40 border border-amber-900/50 text-amber-200/70 hover:text-amber-100 disabled:opacity-50 touch-manipulation"
          title="Atualizar log"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {logs === null && loading && (
        <p className="text-sm text-amber-200/50 animate-pulse p-2">Carregando ações...</p>
      )}
      {logs !== null && logs.length === 0 && (
        <p className="text-sm text-amber-200/40 p-2">Nenhuma ação administrativa registrada ainda.</p>
      )}

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {(logs ?? []).map((l) => {
          const style = RESULT_STYLES[l.result] ?? { label: l.result, cls: 'text-amber-200/70 border-amber-900/50 bg-black/40' };
          const when = new Date(l.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
          return (
            <div key={l.id} className="rounded-lg border border-amber-900/40 bg-black/30 px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-amber-200/40 tabular-nums">{when}</span>
                <span className={`text-[10px] border rounded px-1.5 py-0.5 ${style.cls}`}>{style.label}</span>
                <span className="text-xs text-amber-100 font-heading flex items-center gap-1">
                  {l.action === 'delete_character' ? <Skull className="w-3 h-3 text-red-400" /> : <Users className="w-3 h-3 text-red-400" />}
                  Excluiu {l.targetType}
                </span>
                <span className="text-xs text-amber-100 truncate">“{l.targetName}”</span>
              </div>
              <div className="text-[10px] text-amber-200/50 mt-1 flex items-center gap-2 flex-wrap">
                <span className="truncate">por {l.adminEmail}</span>
                <span className="text-amber-200/30">·</span>
                <span>
                  camadas: local <b className={l.layers.local === 'ok' ? 'text-emerald-400' : l.layers.local === 'failed' ? 'text-red-400' : 'text-amber-200/60'}>{l.layers.local}</b> / nuvem <b className={l.layers.cloud === 'ok' ? 'text-emerald-400' : l.layers.cloud === 'failed' ? 'text-red-400' : 'text-amber-200/60'}>{l.layers.cloud}</b>
                </span>
              </div>
              {l.details && (
                <details className="mt-1.5 group">
                  <summary className="text-[10px] text-amber-200/40 cursor-pointer hover:text-amber-200/70 select-none touch-manipulation">
                    detalhes
                  </summary>
                  <pre className="text-[10px] text-amber-200/60 whitespace-pre-wrap break-words mt-1 max-h-40 overflow-y-auto leading-relaxed">{l.details}</pre>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// v0.14 — MODAL: EXCLUSÃO DE PERSONAGEM (confirmação dupla)
// =====================================================================

function DeleteCharacterModal({
  target,
  adminEmailOk,
  text,
  onText,
  working,
  result,
  onConfirm,
  onClose,
}: {
  target: AdminCharacterRow | null;
  adminEmailOk: boolean;
  text: string;
  onText: (v: string) => void;
  working: boolean;
  result: { kind: 'ok' | 'warn' | 'err'; text: string } | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!target) return null;
  const name = target.name;
  const ready = adminEmailOk && text.trim() === name && !working && !result;
  const onlineNow =
    target.source === 'local' &&
    target.lastSeenAt !== null &&
    Date.now() - new Date(target.lastSeenAt).getTime() < 10 * 60 * 1000;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 flex items-start sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Excluir personagem ${name}`}
    >
      <div className="w-full max-w-md my-auto rounded-2xl border-2 border-red-800/70 bg-[#16110b] shadow-2xl shadow-black/70 max-h-[calc(100dvh-1.5rem)] flex flex-col">
        <div className="flex-none px-5 py-4 border-b border-red-900/50 flex items-center justify-between gap-2">
          <h3 className="font-heading text-base text-red-200 flex items-center gap-2">
            <Skull className="w-5 h-5 text-red-400" /> Excluir personagem
          </h3>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] rounded-lg bg-black/40 border border-red-900/50 text-red-200/70 hover:text-red-100 touch-manipulation"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          {/* alvo */}
          <div className="rounded-lg border border-red-900/50 bg-black/40 p-3 space-y-1">
            <p className="font-heading text-sm text-amber-100">
              {RACE_EMOJI[target.race] ?? '⚔️'} {name}
            </p>
            <p className="text-[11px] text-amber-200/60">
              {RACES[target.race as keyof typeof RACES]?.name ?? target.race} · Nv {target.level} ·{' '}
              {target.source === 'local' ? 'no servidor' : 'só na nuvem'}
              {target.guildName
                ? ` · ${target.isGuildLeader ? 'LÍDER da' : 'membro da'} guilda “${target.guildName}”${
                    target.guildMemberCount ? ` (${target.guildMemberCount} membro(s))` : ''
                  }`
                : ''}
            </p>
            {target.ownerEmail && (
              <p className="text-[11px] text-amber-200/40 break-all" title={target.ownerEmail}>
                Conta dona: {target.ownerEmail}
              </p>
            )}
          </div>

          {/* aviso de auto-dissolução */}
          {target.isGuildLeader && target.guildName && (
            <div className="rounded-lg border border-red-700/60 bg-red-950/40 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-200/90 leading-relaxed">
                <b>EXCLUINDO O LÍDER, A GUILDA MORRE JUNTO.</b> “{target.guildName}”
                {target.guildMemberCount ? ` (${target.guildMemberCount} membro(s))` : ''} será apagada com erasure
                total — cargos, convites, solicitações e TODO o histórico de doações. Os membros ficam sem guilda,
                íntegros. Se não quer isso, transfira a liderança ANTES de excluir.
              </p>
            </div>
          )}

          {/* aviso de jogador online */}
          {onlineNow && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Este personagem está ATIVO agora (atividade nos últimos 10 minutos). A exclusão segue — mas o dono
                ainda tem o jogo aberto; a re-sincronização dele pode recriar o espelho na nuvem. Ideal: exclua com o
                jogador offline, ou re-confira depois.
              </p>
            </div>
          )}

          {/* o que morre junto */}
          <div className="text-[11px] text-red-200/70 leading-relaxed">
            <b className="text-red-300">Ação IRREVERSÍVEL.</b> {name} some do servidor E da nuvem na mesma operação
            (backup na nuvem em <code>personagens_backup_reset</code>): atividades, missões, conquistas, dano a
            chefes, ledger e doações dele são varridos pelo cascade. A verificação anti-órfã roda na hora — órfão =
            operação reportada como falha. A CONTA dona não é apagada (pode ter outros personagens).
          </div>

          {/* confirmação dupla */}
          <div className="space-y-2 pt-1">
            <label className="text-[11px] text-red-200/80 block">
              Digite o nome <b className="text-red-300">{name}</b> para confirmar:
            </label>
            <input
              value={text}
              onChange={(e) => onText(e.target.value)}
              placeholder={name}
              disabled={working || !!result}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-black/60 border border-red-900/60 rounded-lg px-3 py-3 min-h-[44px] text-red-100 text-sm focus:outline-none focus:border-red-500 touch-manipulation"
              aria-label="Confirmação — nome do personagem"
            />
            {/* v0.15 — feedback AO DIGITAR: por que o botão segue travado?
                nome com/sem acento é o caso clássico — a dica mostra o
                nome EXATO esperado enquanto o admin digita */}
            {text.trim() !== '' && text.trim() !== name && !result && (
              <p role="alert" className="text-[11px] text-red-300/80 leading-relaxed">
                Ainda não confere — digite <b className="text-red-200 break-all">{name}</b> exatamente como
                mostrado (acentos, espaços e maiúsculas). O botão libera quando o nome bater.
              </p>
            )}
          </div>

          {result && (
            <p
              role="status"
              className={`text-xs leading-relaxed rounded-lg px-3 py-2 border whitespace-pre-wrap break-words ${
                result.kind === 'ok'
                  ? 'text-emerald-300 border-emerald-800/50 bg-emerald-950/30'
                  : result.kind === 'warn'
                    ? 'text-amber-300 border-amber-800/50 bg-amber-950/30'
                    : 'text-red-300 border-red-800/50 bg-red-950/30'
              }`}
            >
              {result.text}
            </p>
          )}
        </div>

        <div className="flex-none px-5 py-4 border-t border-red-900/50 flex flex-col-reverse sm:flex-row gap-2">
          <button
            onClick={onClose}
            disabled={working}
            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg bg-black/40 border border-amber-900/50 text-amber-200/80 text-sm font-heading hover:border-amber-700 disabled:opacity-40 touch-manipulation"
          >
            {result?.kind === 'ok' ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready}
            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-heading disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
          >
            {working ? 'Excluindo…' : `EXCLUIR ${name}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// v0.14 — MODAL: EXCLUSÃO DE GUILDA (confirmação dupla + inventário)
// =====================================================================

function DeleteGuildModal({
  target,
  text,
  onText,
  working,
  result,
  onConfirm,
  onClose,
}: {
  target: AdminGuildRow | null;
  text: string;
  onText: (v: string) => void;
  working: boolean;
  result: { kind: 'ok' | 'warn' | 'err'; text: string } | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!target) return null;
  const name = target.name;
  const ready = text.trim() === name && !working && !result;

  return (
    <div
      className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-sm overflow-y-auto p-3 sm:p-4 flex items-start sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Excluir guilda ${name}`}
    >
      <div className="w-full max-w-md my-auto rounded-2xl border-2 border-red-800/70 bg-[#16110b] shadow-2xl shadow-black/70 max-h-[calc(100dvh-1.5rem)] flex flex-col">
        <div className="flex-none px-5 py-4 border-b border-red-900/50 flex items-center justify-between gap-2">
          <h3 className="font-heading text-base text-red-200 flex items-center gap-2">
            <Skull className="w-5 h-5 text-red-400" /> Excluir guilda
          </h3>
          <button
            onClick={onClose}
            className="p-2 min-w-[44px] min-h-[44px] rounded-lg bg-black/40 border border-red-900/50 text-red-200/70 hover:text-red-100 touch-manipulation"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          {/* alvo + INVENTÁRIO do que morre junto */}
          <div className="rounded-lg border border-red-900/50 bg-black/40 p-3 space-y-1.5">
            <p className="font-heading text-sm text-amber-100">🛡️ {name}</p>
            <p className="text-[11px] text-amber-200/60">
              Nv {target.level} · líder {target.leaderName ?? '—'}
            </p>
            <div className="text-[11px] text-amber-200/70 leading-relaxed space-y-1 pt-1 border-t border-amber-900/40">
              <p>
                <b className="text-red-300">Membros ({target.memberCount}):</b>{' '}
                {target.memberNames.join(', ') || '—'} — todos ficam SEM guilda, estado íntegro, sem erro.
              </p>
              <p>
                <b className="text-red-300">Doações históricas:</b> {target.totalDonated.toLocaleString('pt-BR')} Zeni
                em {target.donationCount} registro(s) — TODO o histórico é apagado (erasure total).
              </p>
              <p>
                <b className="text-red-300">Pendências:</b> {target.pendingInvites} convite(s) e{' '}
                {target.pendingRequests} solicitação(ões) — varridos junto.
              </p>
              <p>
                <b className="text-red-300">Nome:</b> “{name}” fica LIVRE para reuso imediato.
              </p>
            </div>
          </div>

          {target.onlineMembers.length > 0 && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                {target.onlineMembers.length} membro(s) online agora ({target.onlineMembers.join(', ')}) — a exclusão
                segue normalmente; eles apenas perdem a guilda no próximo instante.
              </p>
            </div>
          )}

          <div className="text-[11px] text-red-200/70 leading-relaxed">
            <b className="text-red-300">Ação IRREVERSÍVEL.</b> A guilda deixa de existir por completo (linha, cargos,
            MOTD, convites, solicitações, doações). Guildas não são espelhadas na nuvem — a exclusão é local. A
            verificação anti-órfã roda na hora.
          </div>

          {/* confirmação dupla */}
          <div className="space-y-2 pt-1">
            <label className="text-[11px] text-red-200/80 block">
              Digite o nome da guilda <b className="text-red-300">{name}</b> para confirmar:
            </label>
            <input
              value={text}
              onChange={(e) => onText(e.target.value)}
              placeholder={name}
              disabled={working || !!result}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-black/60 border border-red-900/60 rounded-lg px-3 py-3 min-h-[44px] text-red-100 text-sm focus:outline-none focus:border-red-500 touch-manipulation"
              aria-label="Confirmação — nome da guilda"
            />
            {/* v0.15 — mesma dica AO DIGITAR do modal de personagem */}
            {text.trim() !== '' && text.trim() !== name && !result && (
              <p role="alert" className="text-[11px] text-red-300/80 leading-relaxed">
                Ainda não confere — digite <b className="text-red-200 break-all">{name}</b> exatamente como
                mostrado (acentos, espaços e maiúsculas). O botão libera quando o nome bater.
              </p>
            )}
          </div>

          {result && (
            <p
              role="status"
              className={`text-xs leading-relaxed rounded-lg px-3 py-2 border whitespace-pre-wrap break-words ${
                result.kind === 'ok'
                  ? 'text-emerald-300 border-emerald-800/50 bg-emerald-950/30'
                  : result.kind === 'warn'
                    ? 'text-amber-300 border-amber-800/50 bg-amber-950/30'
                    : 'text-red-300 border-red-800/50 bg-red-950/30'
              }`}
            >
              {result.text}
            </p>
          )}
        </div>

        <div className="flex-none px-5 py-4 border-t border-red-900/50 flex flex-col-reverse sm:flex-row gap-2">
          <button
            onClick={onClose}
            disabled={working}
            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg bg-black/40 border border-amber-900/50 text-amber-200/80 text-sm font-heading hover:border-amber-700 disabled:opacity-40 touch-manipulation"
          >
            {result?.kind === 'ok' ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready}
            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-heading disabled:opacity-30 disabled:cursor-not-allowed touch-manipulation"
          >
            {working ? 'Excluindo…' : `EXCLUIR ${name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
