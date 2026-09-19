'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Globe2,
  MessageCircle,
  MessagesSquare,
  Minus,
  Search,
  Send,
  Shield,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

type Channel = 'global' | 'guild' | 'private';
type Context = {
  authenticated: boolean;
  player: null | {
    id: string;
    name: string;
    race: string;
    level: number;
    guild: { id: string; name: string } | null;
  };
  muted: Array<{ playerId: string; name: string; createdAt: string }>;
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

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>('global');
  const [context, setContext] = useState<Context | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privateTarget, setPrivateTarget] = useState<Person | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const player = context?.player ?? null;
  const mutedIds = useMemo(() => new Set((context?.muted ?? []).map((m) => m.playerId)), [context?.muted]);

  const loadContext = useCallback(async () => {
    const res = await fetch('/api/chat?view=context', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setContext(data);
  }, []);

  const loadConversations = useCallback(async () => {
    if (!player) return;
    const res = await fetch('/api/chat?view=conversations', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }, [player]);

  const loadMessages = useCallback(async (older = false) => {
    if (!player) return;
    if (channel === 'guild' && !player.guild) return;
    if (channel === 'private' && !privateTarget) {
      setMessages([]);
      return;
    }

    const params = new URLSearchParams({ view: 'messages', channel });
    if (channel === 'private' && privateTarget) params.set('targetId', privateTarget.id);
    if (older && messages.length > 0) params.set('before', messages[0].createdAt);

    if (!older) setLoading(true);
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
        if (older) {
          const ids = new Set(current.map((m) => m.id));
          return [...incoming.filter((m) => !ids.has(m.id)), ...current];
        }
        return incoming;
      });
      setError(null);
    } finally {
      if (!older) setLoading(false);
    }
  }, [player, channel, privateTarget, messages]);

  useEffect(() => {
    if (!open) return;
    void loadContext();
  }, [open, loadContext]);

  useEffect(() => {
    if (!open || !player) return;
    void loadMessages(false);
    if (channel === 'private') void loadConversations();
  }, [open, player?.id, channel, privateTarget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !player) return;
    const timer = window.setInterval(() => {
      void loadContext();
      if (channel === 'private' && !privateTarget) void loadConversations();
      else void loadMessages(false);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [open, player?.id, channel, privateTarget?.id, loadContext, loadConversations]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || channel !== 'private') return;
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/chat?view=players&q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setSearchResults(Array.isArray(data.players) ? data.players : []);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, channel, search]);

  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading, messages.length, privateTarget?.id]);

  const send = useCallback(async () => {
    if (!player || sending || !composer.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
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
      await loadMessages(false);
      if (channel === 'private') await loadConversations();
    } finally {
      setSending(false);
    }
  }, [player, sending, composer, channel, privateTarget, loadMessages, loadConversations]);

  const setMute = useCallback(async (target: Person, mute: boolean) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: mute ? 'mute' : 'unmute', targetId: target.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error?.message ?? 'Não foi possível alterar o silêncio.');
      return;
    }
    await loadContext();
    if (mute && privateTarget?.id === target.id) {
      setPrivateTarget(null);
      setMessages([]);
    } else {
      await loadMessages(false);
    }
    await loadConversations();
  }, [loadContext, privateTarget?.id, loadMessages, loadConversations]);

  const openPrivate = useCallback((target: Person) => {
    setChannel('private');
    setPrivateTarget(target);
    setSearch('');
    setSearchResults([]);
  }, []);

  const tabs: Array<{ id: Channel; label: string; icon: typeof Globe2; disabled?: boolean }> = [
    { id: 'global', label: 'Global', icon: Globe2 },
    { id: 'guild', label: 'Guilda', icon: Shield, disabled: Boolean(player && !player.guild) },
    { id: 'private', label: 'Privado', icon: UserRound },
  ];

  const canCompose =
    Boolean(player) &&
    (channel !== 'guild' || Boolean(player?.guild)) &&
    (channel !== 'private' || Boolean(privateTarget));

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
                {player ? `Falando como ${player.name}` : 'Entre e selecione um guerreiro'}
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

          {!context ? (
            <div className="flex-1 grid place-items-center text-sm text-amber-200/50">Carregando chat…</div>
          ) : !context.authenticated ? (
            <div className="flex-1 p-5 grid place-items-center text-center">
              <p className="text-sm text-amber-100">Entre no jogo para usar o chat.</p>
            </div>
          ) : !player ? (
            <div className="flex-1 p-5 grid place-items-center text-center">
              <p className="text-sm text-amber-100">Selecione um guerreiro em <b>Jogar</b> para conversar.</p>
            </div>
          ) : (
            <>
              <nav className="grid grid-cols-3 border-b border-orange-900/40 bg-black/20">
                {tabs.map(({ id, label, icon: Icon, disabled }) => (
                  <button
                    type="button"
                    key={id}
                    disabled={disabled}
                    onClick={() => {
                      setChannel(id);
                      setError(null);
                      if (id !== 'private') setPrivateTarget(null);
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
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-200/30" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar guerreiro pelo nome"
                      className="w-full rounded-lg border border-orange-900/50 bg-black/40 py-2 pl-8 pr-3 text-sm text-amber-100 outline-none focus:border-orange-600"
                    />
                  </div>
                  {search.trim().length >= 2 && (
                    <div className="space-y-1">
                      {searchResults.map((person) => (
                        <button
                          type="button"
                          key={person.id}
                          onClick={() => openPrivate(person)}
                          className="w-full text-left rounded-lg border border-orange-900/30 bg-black/20 px-3 py-2 hover:border-orange-700/60"
                        >
                          <span className="text-sm text-amber-100">{person.name}</span>
                          {person.level ? <span className="ml-2 text-[10px] text-amber-200/40">Nv {person.level}</span> : null}
                        </button>
                      ))}
                      {searchResults.length === 0 && <p className="text-xs text-amber-200/40 px-1">Nenhum guerreiro encontrado.</p>}
                    </div>
                  )}

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

                  {(context.muted?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-amber-200/40 mb-1">Silenciados</p>
                      <div className="space-y-1">
                        {context.muted.map((item) => (
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
                      <button
                        type="button"
                        onClick={() => void setMute(privateTarget, !mutedIds.has(privateTarget.id))}
                        className="flex items-center gap-1 p-1.5 text-[10px] text-amber-200/60 hover:text-amber-100"
                        title={mutedIds.has(privateTarget.id) ? 'Remover silêncio' : 'Silenciar jogador'}
                      >
                        {mutedIds.has(privateTarget.id) ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                        {mutedIds.has(privateTarget.id) ? 'Ouvir' : 'Silenciar'}
                      </button>
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
                        onClick={() => void loadMessages(true)}
                        className="mx-auto block text-[10px] text-orange-300 hover:text-orange-200"
                      >
                        Carregar mensagens anteriores
                      </button>
                    )}
                    {loading && <p className="text-xs text-amber-200/40 text-center">Carregando…</p>}
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
                              <button
                                type="button"
                                onClick={() => void setMute({ id: message.senderPlayerId, name: message.senderName }, true)}
                                className="text-amber-200/30 hover:text-red-300"
                                title="Silenciar jogador"
                                aria-label={`Silenciar ${message.senderName}`}
                              >
                                <VolumeX className="h-3 w-3" />
                              </button>
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
            </>
          )}
        </section>
      )}
    </>
  );
}
