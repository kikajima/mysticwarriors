'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock3,
  Globe2,
  MessageCircle,
  MessagesSquare,
  Minus,
  Search,
  Send,
  Shield,
  UserMinus,
  UserPlus,
  UserRound,
  Ban,
  ShieldOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

type Channel = 'global' | 'guild' | 'private';
export type ChatPlayer = {
  id: string;
  name: string;
  race: string;
  level: number;
  guild: { id: string; name: string } | null;
};
type Message = {
  id: string;
  channel: Channel;
  senderPlayerId: string;
  senderName: string;
  recipientPlayerId: string | null;
  recipientName: string | null;
  guildId: string | null;
  guildName: string | null;
  body: string;
  createdAt: string;
};
type Person = { id: string; name: string; level?: number; race?: string };
type Conversation = {
  playerId: string;
  name: string;
  lastMessage: string;
  createdAt: string;
  mine: boolean;
};
type MutedPlayer = { playerId: string; name: string; createdAt: string };
type SocialPlayer = { playerId: string; name: string; createdAt: string };

const CHAT_MAX_MESSAGE = 500;

function shortTime(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ChatWidget({ player }: { player: ChatPlayer }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>('global');
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privateTarget, setPrivateTarget] = useState<Person | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [muted, setMuted] = useState<MutedPlayer[]>([]);
  const [friends, setFriends] = useState<SocialPlayer[]>([]);
  const [friendRequestsIncoming, setFriendRequestsIncoming] = useState<SocialPlayer[]>([]);
  const [friendRequestsOutgoing, setFriendRequestsOutgoing] = useState<SocialPlayer[]>([]);
  const [blocked, setBlocked] = useState<SocialPlayer[]>([]);
  const [socialBusy, setSocialBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [directory, setDirectory] = useState<Person[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryVisible, setDirectoryVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const directoryLoadedRef = useRef(false);

  const guildId = player.guild?.id ?? null;
  const mutedIds = useMemo(() => new Set(muted.map((item) => item.playerId)), [muted]);
  const friendIds = useMemo(() => new Set(friends.map((item) => item.playerId)), [friends]);
  const incomingRequestIds = useMemo(
    () => new Set(friendRequestsIncoming.map((item) => item.playerId)),
    [friendRequestsIncoming]
  );
  const outgoingRequestIds = useMemo(
    () => new Set(friendRequestsOutgoing.map((item) => item.playerId)),
    [friendRequestsOutgoing]
  );
  const blockedIds = useMemo(() => new Set(blocked.map((item) => item.playerId)), [blocked]);
  const filteredDirectory = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    if (!q) return directory;
    return directory.filter((person) => person.name.toLocaleLowerCase('pt-BR').includes(q));
  }, [directory, search]);

  const loadContext = useCallback(async () => {
    const params = new URLSearchParams({ view: 'context', playerId: player.id });
    const res = await fetch(`/api/chat?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) {
      setMuted(Array.isArray(data.muted) ? data.muted : []);
      setFriends(Array.isArray(data.friends) ? data.friends : []);
      setFriendRequestsIncoming(Array.isArray(data.friendRequestsIncoming) ? data.friendRequestsIncoming : []);
      setFriendRequestsOutgoing(Array.isArray(data.friendRequestsOutgoing) ? data.friendRequestsOutgoing : []);
      setBlocked(Array.isArray(data.blocked) ? data.blocked : []);
    }
  }, [player.id]);

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams({ view: 'conversations', playerId: player.id });
    const res = await fetch(`/api/chat?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }, [player.id]);

  const loadDirectory = useCallback(async () => {
    if (directoryLoadedRef.current || directoryLoading) return;
    setDirectoryLoading(true);
    try {
      const params = new URLSearchParams({ view: 'players', playerId: player.id });
      const res = await fetch(`/api/chat?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setDirectory(Array.isArray(data.players) ? data.players : []);
        directoryLoadedRef.current = true;
      }
    } finally {
      setDirectoryLoading(false);
    }
  }, [directoryLoading, player.id]);

  const loadMessages = useCallback(async (older = false, showLoading = false) => {
    if (channel === 'guild' && !guildId) return;
    if (channel === 'private' && !privateTarget) {
      messagesRef.current = [];
      setMessages([]);
      setHasMore(false);
      return;
    }

    const currentMessages = messagesRef.current;
    const params = new URLSearchParams({
      view: 'messages',
      channel,
      playerId: player.id,
    });
    if (channel === 'private' && privateTarget) params.set('targetId', privateTarget.id);
    if (older && currentMessages.length > 0) params.set('before', currentMessages[0].createdAt);

    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`/api/chat?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Não foi possível carregar o chat.');
        return;
      }
      const incoming: Message[] = Array.isArray(data.messages) ? data.messages : [];
      setHasMore(Boolean(data.hasMore));
      setMessages((current) => {
        const ids = new Set(current.map((item) => item.id));
        const next = older
          ? [...incoming.filter((item) => !ids.has(item.id)), ...current]
          : incoming;
        messagesRef.current = next;
        return next;
      });
      setError(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [channel, player.id, guildId, privateTarget]);

  // O componente é remontado quando o jogador sai da tela de jogo. Mesmo assim,
  // esta limpeza garante que uma troca de playerId nunca mostre dados do anterior.
  useEffect(() => {
    messagesRef.current = [];
    directoryLoadedRef.current = false;
    setMessages([]);
    setConversations([]);
    setMuted([]);
    setFriends([]);
    setFriendRequestsIncoming([]);
    setFriendRequestsOutgoing([]);
    setBlocked([]);
    setSocialBusy(null);
    setDirectory([]);
    setPrivateTarget(null);
    setSearch('');
    setDirectoryVisible(false);
    setChannel('global');
    setError(null);
  }, [player.id]);

  useEffect(() => {
    if (!open) return;
    void loadContext();
  }, [open, loadContext]);

  useEffect(() => {
    if (!open) return;
    messagesRef.current = [];
    setMessages([]);
    void loadMessages(false, true);
    if (channel === 'private') void loadConversations();
    if (channel === 'private' && !privateTarget) void loadDirectory();
  }, [open, channel, privateTarget?.id, loadMessages, loadConversations, loadDirectory]);

  // Polling silencioso: atualiza em segundo plano sem ligar "Carregando…".
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      void loadContext();
      if (channel === 'private' && !privateTarget) {
        void loadConversations();
      } else {
        void loadMessages(false, false);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [open, channel, privateTarget, loadContext, loadConversations, loadMessages]);

  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading, messages.length, privateTarget?.id]);

  const send = useCallback(async () => {
    if (sending || !composer.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          playerId: player.id,
          channel,
          body: composer,
          ...(channel === 'private' && privateTarget ? { targetId: privateTarget.id } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Mensagem não enviada.');
        return;
      }
      setComposer('');
      setError(null);
      await loadMessages(false, false);
      if (channel === 'private') await loadConversations();
    } finally {
      setSending(false);
    }
  }, [sending, composer, player.id, channel, privateTarget, loadMessages, loadConversations]);

  const setMute = useCallback(async (target: Person, mute: boolean) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: mute ? 'mute' : 'unmute',
        playerId: player.id,
        targetId: target.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? 'Não foi possível alterar o silêncio.');
      return;
    }
    await loadContext();
    if (mute && privateTarget?.id === target.id) {
      setPrivateTarget(null);
      messagesRef.current = [];
      setMessages([]);
    } else {
      await loadMessages(false, false);
    }
    await loadConversations();
  }, [player.id, loadContext, privateTarget?.id, loadMessages, loadConversations]);

  const changeSocial = useCallback(async (
    target: Person,
    action:
      | 'send_friend_request'
      | 'cancel_friend_request'
      | 'accept_friend_request'
      | 'decline_friend_request'
      | 'remove_friend'
      | 'block'
      | 'unblock'
  ) => {
    setSocialBusy(`${action}:${target.id}`);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, playerId: player.id, targetId: target.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? 'Não foi possível alterar a relação social.');
        return;
      }
      setError(null);
      await loadContext();
      await loadConversations();
      if (action === 'block' && privateTarget?.id === target.id) {
        setPrivateTarget(null);
        messagesRef.current = [];
        setMessages([]);
      } else if (privateTarget?.id === target.id) {
        await loadMessages(false, false);
      }
    } finally {
      setSocialBusy(null);
    }
  }, [player.id, loadContext, loadConversations, privateTarget?.id, loadMessages]);

  const openPrivate = useCallback((target: Person) => {
    setChannel('private');
    setPrivateTarget(target);
    setSearch('');
    setDirectoryVisible(false);
  }, []);

  const tabs: Array<{ id: Channel; label: string; icon: typeof Globe2; disabled?: boolean }> = [
    { id: 'global', label: 'Global', icon: Globe2 },
    { id: 'guild', label: 'Guilda', icon: Shield, disabled: !player.guild },
    { id: 'private', label: 'Privado', icon: UserRound },
  ];

  const canCompose =
    (channel !== 'guild' || Boolean(player.guild)) &&
    (channel !== 'private' || (Boolean(privateTarget) && !blockedIds.has(privateTarget!.id)));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-20 sm:bottom-4 left-4 z-[80] h-12 w-12 rounded-full border-2 border-orange-400/70 bg-[#21140a] text-orange-200 shadow-xl shadow-black/50 hover:bg-[#2d190b] flex items-center justify-center"
        aria-label={open ? 'Minimizar chat' : 'Abrir chat'}
        title="Chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {open && (
        <section
          className="fixed bottom-20 sm:bottom-4 left-4 z-[79] w-[min(390px,calc(100vw-1.5rem))] h-[min(560px,72dvh)] rounded-2xl border border-orange-800/60 bg-[#17100a]/98 shadow-2xl shadow-black/70 flex flex-col overflow-hidden"
          aria-label="Chat do jogo"
        >
          <header className="flex items-center justify-between gap-2 border-b border-orange-900/50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-heading text-sm text-amber-100 flex items-center gap-2">
                <MessagesSquare className="h-4 w-4 text-orange-400" /> Chat
              </p>
              <p className="text-[10px] text-amber-200/50 truncate">
                Falando como {player.name}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setOpen(false)} className="p-2 text-amber-200/60 hover:text-amber-100" aria-label="Minimizar chat">
                <Minus className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="p-2 text-amber-200/60 hover:text-amber-100" aria-label="Fechar chat">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <nav className="grid grid-cols-3 border-b border-orange-900/40 bg-black/20">
            {tabs.map(({ id, label, icon: Icon, disabled }) => (
              <button
                type="button"
                key={id}
                disabled={disabled}
                onClick={() => {
                  setChannel(id);
                  setError(null);
                  if (id === 'private') {
                    setDirectoryVisible(true);
                    void loadDirectory();
                  } else {
                    setDirectoryVisible(false);
                    setPrivateTarget(null);
                  }
                }}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs border-b-2 transition-colors disabled:opacity-30 ${
                  channel === id ? 'border-orange-500 text-orange-200 bg-orange-950/20' : 'border-transparent text-amber-200/50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </nav>

          {channel === 'private' && !privateTarget ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
              <div className="rounded-lg border border-orange-900/30 bg-orange-950/10 px-3 py-2">
                <p className="text-xs font-heading text-amber-100">Amigos e contatos</p>
                <p className="text-[10px] text-amber-200/45 mt-0.5">
                  Envie um convite de amizade. O outro guerreiro precisa aceitar antes de vocês virarem amigos.
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-200/30" />
                <input
                  value={search}
                  onFocus={() => {
                    setDirectoryVisible(true);
                    void loadDirectory();
                  }}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setDirectoryVisible(true);
                  }}
                  placeholder="Buscar guerreiro pelo nome"
                  className="w-full rounded-lg border border-orange-900/50 bg-black/40 py-2 pl-8 pr-3 text-sm text-amber-100 outline-none focus:border-orange-600"
                />
              </div>

              {directoryVisible && (
                <div className="space-y-1 rounded-lg border border-orange-900/30 bg-black/20 p-1.5">
                  <p className="px-1.5 py-1 text-[10px] uppercase tracking-wide text-amber-200/40">
                    {search.trim() ? 'Resultados' : 'Todos os guerreiros'}
                  </p>
                  {directoryLoading && directory.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-amber-200/40">Carregando guerreiros…</p>
                  ) : filteredDirectory.length > 0 ? (
                    filteredDirectory.map((person) => {
                      const isFriend = friendIds.has(person.id);
                      const hasIncomingRequest = incomingRequestIds.has(person.id);
                      const hasOutgoingRequest = outgoingRequestIds.has(person.id);
                      const isBlocked = blockedIds.has(person.id);
                      return (
                        <div
                          key={person.id}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-orange-950/30"
                        >
                          <button
                            type="button"
                            onClick={() => openPrivate(person)}
                            className="min-w-0 flex-1 text-left rounded-md px-1 py-1"
                            title={isBlocked ? 'Abrir contato bloqueado' : 'Abrir conversa privada'}
                          >
                            <span className="text-sm text-amber-100">{person.name}</span>
                            {person.level ? <span className="ml-2 text-[10px] text-amber-200/40">Nv {person.level}</span> : null}
                            {isFriend && <span className="ml-2 text-[9px] text-emerald-300">★ Amigo</span>}
                            {hasIncomingRequest && <span className="ml-2 text-[9px] text-cyan-300">Pedido recebido</span>}
                            {hasOutgoingRequest && <span className="ml-2 text-[9px] text-amber-300">Convite enviado</span>}
                            {isBlocked && <span className="ml-2 text-[9px] text-red-300">Bloqueado</span>}
                          </button>

                          {isBlocked ? (
                            <button
                              type="button"
                              disabled={socialBusy !== null}
                              onClick={() => void changeSocial(person, 'unblock')}
                              className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-900/40 bg-emerald-950/20 px-2 py-1 text-[10px] text-emerald-300 hover:border-emerald-700/60 disabled:opacity-30"
                              title="Desbloquear guerreiro"
                              aria-label={`Desbloquear ${person.name}`}
                            >
                              <ShieldOff className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Desbloquear</span>
                            </button>
                          ) : (
                            <>
                              {isFriend ? (
                                <button
                                  type="button"
                                  disabled={socialBusy !== null}
                                  onClick={() => void changeSocial(person, 'remove_friend')}
                                  className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-900/40 bg-emerald-950/15 px-2 py-1 text-[10px] text-emerald-300 hover:border-emerald-700/60 disabled:opacity-30"
                                  title="Remover dos amigos"
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Remover</span>
                                </button>
                              ) : hasIncomingRequest ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={socialBusy !== null}
                                    onClick={() => void changeSocial(person, 'accept_friend_request')}
                                    className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-800/50 bg-emerald-950/25 px-2 py-1 text-[10px] text-emerald-300 disabled:opacity-30"
                                    title="Aceitar convite de amizade"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Aceitar</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={socialBusy !== null}
                                    onClick={() => void changeSocial(person, 'decline_friend_request')}
                                    className="shrink-0 rounded-md border border-amber-900/40 px-2 py-1 text-[10px] text-amber-300 disabled:opacity-30"
                                    title="Recusar convite de amizade"
                                  >
                                    Recusar
                                  </button>
                                </>
                              ) : hasOutgoingRequest ? (
                                <button
                                  type="button"
                                  disabled={socialBusy !== null}
                                  onClick={() => void changeSocial(person, 'cancel_friend_request')}
                                  className="shrink-0 flex items-center gap-1 rounded-md border border-amber-900/40 bg-amber-950/15 px-2 py-1 text-[10px] text-amber-300 disabled:opacity-30"
                                  title="Cancelar convite de amizade"
                                >
                                  <Clock3 className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Cancelar</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={socialBusy !== null}
                                  onClick={() => void changeSocial(person, 'send_friend_request')}
                                  className="shrink-0 flex items-center gap-1 rounded-md border border-emerald-900/40 bg-emerald-950/15 px-2 py-1 text-[10px] text-emerald-300 hover:border-emerald-700/60 disabled:opacity-30"
                                  title="Enviar convite de amizade"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Convidar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={socialBusy !== null}
                                onClick={() => void changeSocial(person, 'block')}
                                className="shrink-0 flex items-center gap-1 rounded-md border border-red-900/40 bg-red-950/15 px-2 py-1 text-[10px] text-red-300 hover:border-red-700/60 disabled:opacity-30"
                                title="Bloquear guerreiro"
                                aria-label={`Bloquear ${person.name}`}
                              >
                                <Ban className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Bloquear</span>
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="px-2 py-2 text-xs text-amber-200/40">Nenhum guerreiro encontrado.</p>
                  )}
                </div>
              )}

              {friendRequestsIncoming.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[10px] uppercase tracking-wide text-cyan-300/70">Pedidos de amizade</p>
                    <span className="text-[9px] text-cyan-300/60">{friendRequestsIncoming.length}</span>
                  </div>
                  <div className="space-y-1">
                    {friendRequestsIncoming.map((request) => (
                      <div key={request.playerId} className="flex items-center gap-2 rounded-lg border border-cyan-900/40 bg-cyan-950/10 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openPrivate({ id: request.playerId, name: request.name })}
                          className="min-w-0 flex-1 text-left text-xs text-amber-100 truncate"
                        >
                          {request.name}
                        </button>
                        <button
                          type="button"
                          disabled={socialBusy !== null}
                          onClick={() => void changeSocial({ id: request.playerId, name: request.name }, 'accept_friend_request')}
                          className="flex items-center gap-1 text-[10px] text-emerald-300 disabled:opacity-30"
                        >
                          <Check className="h-3.5 w-3.5" /> Aceitar
                        </button>
                        <button
                          type="button"
                          disabled={socialBusy !== null}
                          onClick={() => void changeSocial({ id: request.playerId, name: request.name }, 'decline_friend_request')}
                          className="text-[10px] text-amber-300 disabled:opacity-30"
                        >
                          Recusar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {friendRequestsOutgoing.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-amber-300/60 mb-1">Convites enviados</p>
                  <div className="space-y-1">
                    {friendRequestsOutgoing.map((request) => (
                      <div key={request.playerId} className="flex items-center gap-2 rounded-lg border border-amber-900/30 bg-amber-950/10 px-3 py-2">
                        <span className="min-w-0 flex-1 text-xs text-amber-100 truncate">{request.name}</span>
                        <button
                          type="button"
                          disabled={socialBusy !== null}
                          onClick={() => void changeSocial({ id: request.playerId, name: request.name }, 'cancel_friend_request')}
                          className="flex items-center gap-1 text-[10px] text-amber-300 disabled:opacity-30"
                        >
                          <Clock3 className="h-3.5 w-3.5" /> Cancelar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-[10px] uppercase tracking-wide text-amber-200/40">Amigos</p>
                  <span className="text-[9px] text-emerald-300/60">{friends.length}</span>
                </div>
                <div className="space-y-1">
                  {friends.map((friend) => (
                    <div
                      key={friend.playerId}
                      className="flex items-center gap-2 rounded-lg border border-emerald-900/30 bg-emerald-950/10 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => openPrivate({ id: friend.playerId, name: friend.name })}
                        className="min-w-0 flex-1 text-left text-sm text-amber-100 truncate hover:text-orange-200"
                      >
                        ★ {friend.name}
                      </button>
                      <button
                        type="button"
                        disabled={socialBusy !== null}
                        onClick={() => void changeSocial({ id: friend.playerId, name: friend.name }, 'remove_friend')}
                        className="text-amber-200/35 hover:text-red-300 disabled:opacity-30"
                        title="Remover dos amigos"
                        aria-label={`Remover ${friend.name} dos amigos`}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {friends.length === 0 && (
                    <p className="text-xs text-amber-200/35">Amizades aparecem aqui depois que o convite é aceito.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-amber-200/40 mb-1">Conversas recentes</p>
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <button
                      type="button"
                      key={conv.playerId}
                      onClick={() => openPrivate({ id: conv.playerId, name: conv.name })}
                      className="w-full text-left rounded-lg border border-orange-900/30 bg-black/20 px-3 py-2 hover:border-orange-700/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-amber-100 truncate">{conv.name}</span>
                        <span className="text-[9px] text-amber-200/35 shrink-0">{shortTime(conv.createdAt)}</span>
                      </div>
                      <p className="text-[11px] text-amber-200/45 truncate">{conv.mine ? 'Você: ' : ''}{conv.lastMessage}</p>
                    </button>
                  ))}
                  {conversations.length === 0 && <p className="text-xs text-amber-200/35">Nenhuma conversa privada ainda.</p>}
                </div>
              </div>

              {blocked.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-red-300/60 mb-1">Bloqueados</p>
                  <div className="space-y-1">
                    {blocked.map((item) => (
                      <div key={item.playerId} className="flex items-center justify-between gap-2 rounded-lg border border-red-900/40 bg-red-950/15 px-3 py-2">
                        <span className="text-xs text-amber-100 truncate">{item.name}</span>
                        <button
                          type="button"
                          disabled={socialBusy !== null}
                          onClick={() => void changeSocial({ id: item.playerId, name: item.name }, 'unblock')}
                          className="flex items-center gap-1 text-[10px] text-emerald-300 hover:text-emerald-200 disabled:opacity-30"
                        >
                          <ShieldOff className="h-3.5 w-3.5" /> Desbloquear
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {muted.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-amber-200/40 mb-1">Silenciados</p>
                  <div className="space-y-1">
                    {muted.map((item) => (
                      <div key={item.playerId} className="flex items-center justify-between gap-2 rounded-lg border border-orange-900/30 bg-black/20 px-3 py-2">
                        <span className="text-xs text-amber-100 truncate">{item.name}</span>
                        <button
                          type="button"
                          onClick={() => void setMute({ id: item.playerId, name: item.name }, false)}
                          className="flex items-center gap-1 text-[10px] text-emerald-300 hover:text-emerald-200"
                        >
                          <Volume2 className="h-3.5 w-3.5" /> Ouvir
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {channel === 'private' && privateTarget && (
                <div className="flex items-center gap-2 border-b border-orange-900/30 px-2 py-1.5 bg-black/20">
                  <button type="button" onClick={() => setPrivateTarget(null)} className="p-1.5 text-amber-200/60 hover:text-amber-100" aria-label="Voltar às conversas">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <span className="flex-1 truncate text-xs font-heading text-amber-100">{privateTarget.name}</span>
                  {blockedIds.has(privateTarget.id) ? (
                    <button
                      type="button"
                      disabled={socialBusy !== null}
                      onClick={() => void changeSocial(privateTarget, 'unblock')}
                      className="flex items-center gap-1 p-1.5 text-[10px] text-emerald-300 hover:text-emerald-200 disabled:opacity-30"
                      title="Desbloquear jogador"
                    >
                      <ShieldOff className="h-3.5 w-3.5" /> Desbloquear
                    </button>
                  ) : (
                    <>
                      {friendIds.has(privateTarget.id) ? (
                        <button
                          type="button"
                          disabled={socialBusy !== null}
                          onClick={() => void changeSocial(privateTarget, 'remove_friend')}
                          className="flex items-center gap-1 p-1.5 text-[10px] text-emerald-300/80 disabled:opacity-30"
                          title="Remover dos amigos"
                        >
                          <UserMinus className="h-3.5 w-3.5" /> Remover
                        </button>
                      ) : incomingRequestIds.has(privateTarget.id) ? (
                        <>
                          <button
                            type="button"
                            disabled={socialBusy !== null}
                            onClick={() => void changeSocial(privateTarget, 'accept_friend_request')}
                            className="flex items-center gap-1 p-1.5 text-[10px] text-emerald-300 disabled:opacity-30"
                            title="Aceitar convite de amizade"
                          >
                            <Check className="h-3.5 w-3.5" /> Aceitar
                          </button>
                          <button
                            type="button"
                            disabled={socialBusy !== null}
                            onClick={() => void changeSocial(privateTarget, 'decline_friend_request')}
                            className="p-1.5 text-[10px] text-amber-300 disabled:opacity-30"
                            title="Recusar convite de amizade"
                          >
                            Recusar
                          </button>
                        </>
                      ) : outgoingRequestIds.has(privateTarget.id) ? (
                        <button
                          type="button"
                          disabled={socialBusy !== null}
                          onClick={() => void changeSocial(privateTarget, 'cancel_friend_request')}
                          className="flex items-center gap-1 p-1.5 text-[10px] text-amber-300 disabled:opacity-30"
                          title="Cancelar convite de amizade"
                        >
                          <Clock3 className="h-3.5 w-3.5" /> Pendente
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={socialBusy !== null}
                          onClick={() => void changeSocial(privateTarget, 'send_friend_request')}
                          className="flex items-center gap-1 p-1.5 text-[10px] text-emerald-300/80 hover:text-emerald-200 disabled:opacity-30"
                          title="Enviar convite de amizade"
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Convidar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={socialBusy !== null}
                        onClick={() => void changeSocial(privateTarget, 'block')}
                        className="flex items-center gap-1 p-1.5 text-[10px] text-red-300/70 hover:text-red-200 disabled:opacity-30"
                        title="Bloquear jogador"
                      >
                        <Ban className="h-3.5 w-3.5" /> Bloquear
                      </button>
                      <button
                        type="button"
                        onClick={() => void setMute(privateTarget, !mutedIds.has(privateTarget.id))}
                        className="p-1.5 text-amber-200/45 hover:text-amber-100"
                        title={mutedIds.has(privateTarget.id) ? 'Remover silêncio' : 'Silenciar jogador'}
                        aria-label={mutedIds.has(privateTarget.id) ? 'Remover silêncio' : 'Silenciar jogador'}
                      >
                        {mutedIds.has(privateTarget.id) ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                      </button>
                    </>
                  )}
                </div>
              )}

              {channel === 'guild' && player.guild && (
                <div className="px-3 py-1.5 text-[10px] text-amber-200/45 border-b border-orange-900/30">
                  🛡️ {player.guild.name}
                </div>
              )}

              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => void loadMessages(true, false)}
                    className="mx-auto block text-[10px] text-orange-300 hover:text-orange-200"
                  >
                    Carregar mensagens anteriores
                  </button>
                )}
                {loading && messages.length === 0 && <p className="text-xs text-amber-200/40 text-center">Carregando…</p>}
                {!loading && messages.length === 0 && <p className="text-xs text-amber-200/35 text-center py-6">Nenhuma mensagem ainda.</p>}
                {messages.map((message) => {
                  const mine = message.senderPlayerId === player.id;
                  return (
                    <article
                      key={message.id}
                      className={`rounded-xl border px-3 py-2 ${
                        mine ? 'ml-8 border-orange-700/40 bg-orange-950/30' : 'mr-8 border-amber-900/30 bg-black/25'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={mine}
                          onClick={() => !mine && openPrivate({ id: message.senderPlayerId, name: message.senderName })}
                          className="text-[11px] font-heading text-amber-100 truncate disabled:cursor-default"
                          title={mine ? undefined : 'Abrir conversa privada'}
                        >
                          {mine ? 'Você' : message.senderName}
                        </button>
                        <span className="ml-auto text-[9px] text-amber-200/30 shrink-0">{shortTime(message.createdAt)}</span>
                        {!mine && (
                          <>
                            <button
                              type="button"
                              disabled={socialBusy !== null}
                              onClick={() => void changeSocial(
                                { id: message.senderPlayerId, name: message.senderName },
                                friendIds.has(message.senderPlayerId)
                                  ? 'remove_friend'
                                  : incomingRequestIds.has(message.senderPlayerId)
                                    ? 'accept_friend_request'
                                    : outgoingRequestIds.has(message.senderPlayerId)
                                      ? 'cancel_friend_request'
                                      : 'send_friend_request'
                              )}
                              className="text-amber-200/30 hover:text-emerald-300 disabled:opacity-30"
                              title={
                                friendIds.has(message.senderPlayerId)
                                  ? 'Remover dos amigos'
                                  : incomingRequestIds.has(message.senderPlayerId)
                                    ? 'Aceitar convite de amizade'
                                    : outgoingRequestIds.has(message.senderPlayerId)
                                      ? 'Cancelar convite de amizade'
                                      : 'Enviar convite de amizade'
                              }
                            >
                              {friendIds.has(message.senderPlayerId)
                                ? <UserMinus className="h-3 w-3" />
                                : incomingRequestIds.has(message.senderPlayerId)
                                  ? <Check className="h-3 w-3" />
                                  : outgoingRequestIds.has(message.senderPlayerId)
                                    ? <Clock3 className="h-3 w-3" />
                                    : <UserPlus className="h-3 w-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void setMute({ id: message.senderPlayerId, name: message.senderName }, true)}
                              className="text-amber-200/30 hover:text-red-300"
                              title="Silenciar jogador"
                              aria-label={`Silenciar ${message.senderName}`}
                            >
                              <VolumeX className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-amber-50/90">{message.body}</p>
                    </article>
                  );
                })}
              </div>

              <div className="border-t border-orange-900/40 p-2">
                {error && <p role="alert" className="mb-1 text-[10px] text-red-300">{error}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={composer}
                    maxLength={CHAT_MAX_MESSAGE}
                    disabled={!canCompose || sending}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={
                      channel === 'private' && !privateTarget
                        ? 'Escolha uma conversa'
                        : channel === 'guild' && !player.guild
                          ? 'Entre em uma guilda para conversar'
                          : 'Digite uma mensagem…'
                    }
                    className="min-h-10 max-h-24 flex-1 resize-none rounded-lg border border-orange-900/50 bg-black/40 px-3 py-2 text-xs text-amber-100 outline-none focus:border-orange-600 disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!canCompose || sending || !composer.trim()}
                    className="h-10 w-10 shrink-0 rounded-lg bg-orange-600 text-white grid place-items-center disabled:opacity-30"
                    aria-label="Enviar mensagem"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1 text-right text-[9px] text-amber-200/25">{composer.length}/{CHAT_MAX_MESSAGE}</div>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
