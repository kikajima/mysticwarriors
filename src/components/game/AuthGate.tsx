'use client';

import { useEffect, useState } from 'react';
import type { PlayerView } from '@/lib/game/types';
import type { AccountSession } from '@/lib/auth';
import { GameButton } from './Bits';
import { WikiIconLink } from './WikiIconLink';
import { Mail, Lock, LogIn, UserPlus, ShieldCheck, Dices, User, MailCheck } from 'lucide-react';
import {
  getSupabaseSession,
  supabaseSignUp,
  supabaseSignIn,
} from '@/lib/supabase/client';
import { requestStorageAccessSafely } from '@/lib/iframe-storage';

type Mode = 'login' | 'register' | 'check-email';

/**
 * Portão de entrada do jogo (v0.8 — contas na nuvem Supabase).
 *
 * Cadastro/login por E-MAIL + SENHA (Supabase Auth); o apelido (nick) é
 * salvo na tabela `profiles`. Depois da autenticação, a PONTE
 * /api/auth/supabase abre a sessão local do jogo — se o banco local
 * tiver sido limpo por uma atualização, o progresso é restaurado da
 * nuvem pelo fluxo da página (onAuthed).
 */
export function AuthGate({
  onAuthed,
}: {
  onAuthed: (account: AccountSession, characters: PlayerView[]) => void;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  // contagem regressiva (segundos) quando o serviço de contas pede espera
  const [cooldown, setCooldown] = useState(0);
  // true quando o último cadastro foi barrado por limite de tentativas
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const clearError = () => {
    setError(null);
    setRateLimited(false);
  };

  /** Abre a sessão local do jogo via ponte (token Supabase → cookie). */
  const bridgeToLocal = async (nickForAccount?: string): Promise<boolean> => {
    const session = await getSupabaseSession();
    if (!session) {
      setError('Não foi possível iniciar sua sessão. Tente entrar novamente.');
      return false;
    }
    const res = await fetch('/api/auth/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: session.access_token, nick: nickForAccount }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      setError(data.error?.message ?? 'Não foi possível conectar sua conta ao jogo.');
      return false;
    }
    onAuthed(data.account, data.characters ?? []);
    return true;
  };

  const validateRegister = (): boolean => {
    if (nick.trim().length < 3) {
      setError('O apelido precisa ter pelo menos 3 caracteres.');
      return false;
    }
    if (nick.trim().length > 20) {
      setError('O apelido pode ter no máximo 20 caracteres.');
      return false;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Digite um e-mail válido.');
      return false;
    }
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return false;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return false;
    }
    return true;
  };

  const submitRegister = async () => {
    if (loading || cooldown > 0) return;
    if (!validateRegister()) return;
    setLoading(true);
    try {
      // v0.9.12: gesto do usuário — janela para desbloquear cookies no
      // painel de visualização (iframe cross-site) ANTES do login
      await requestStorageAccessSafely();
      const outcome = await supabaseSignUp({
        email: email.trim(),
        password,
        nick: nick.trim(),
      });
      if (outcome.status === 'error') {
        setError(outcome.message);
        if (outcome.kind === 'rate-limit') {
          setRateLimited(true);
          setCooldown(outcome.retryInSeconds ?? 60);
        }
        return;
      }
      if (outcome.status === 'confirm-email') {
        // projeto com confirmação de e-mail ativada — sem sessão ainda
        setMode('check-email');
        return;
      }
      await bridgeToLocal(nick.trim());
    } catch {
      setError('Falha de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const submitLogin = async () => {
    if (loading || cooldown > 0) return;
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setLoading(true);
    try {
      // v0.9.12: gesto do usuário — desbloqueia cookies no painel antes
      // de abrir a sessão (ver requestStorageAccessSafely)
      await requestStorageAccessSafely();
      const outcome = await supabaseSignIn(email.trim(), password);
      if (outcome.status === 'error') {
        setError(outcome.message);
        if (outcome.kind === 'rate-limit') setCooldown(outcome.retryInSeconds ?? 60);
        return;
      }
      await bridgeToLocal();
    } catch {
      setError('Falha de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const submit = () => (mode === 'register' ? submitRegister() : submitLogin());

  const playAsGuest = async () => {
    setError(null);
    setLoading(true);
    try {
      // v0.9.12: gesto do clique — desbloqueia cookies de terceiros no
      // painel de visualização antes de criar a sessão de convidado
      await requestStorageAccessSafely();
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setError(data.error?.message ?? 'Não foi possível iniciar como convidado.');
        return;
      }
      onAuthed(data.account, []);
    } catch {
      setError('Falha de conexão com o servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full bg-black/40 border border-amber-800/50 rounded-lg pl-10 pr-4 py-3 text-amber-100 placeholder:text-amber-200/30 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-900/50 font-heading';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Banner */}
      <div className="relative w-full h-56 sm:h-72 overflow-hidden">
        {/* Wiki — manual do jogo (canto estratégico do banner) */}
        <div className="absolute top-3 right-3 z-10">
          <WikiIconLink variant="corner" />
        </div>
        {bannerFailed ? (
          <div className="absolute inset-0 bg-gradient-to-b from-orange-900 via-amber-950 to-[#14100b] flex items-center justify-center">
            <span className="text-7xl" aria-hidden>
              🐉
            </span>
          </div>
        ) : (
          <img
            src="/images/banner.png"
            alt="Guerreiros místicos carregando energia ao pôr do sol"
            className="absolute inset-0 w-full h-full object-cover opacity-80"
            onError={() => setBannerFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#14100b] via-transparent to-black/30" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <h1 className="font-display text-5xl sm:text-7xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-orange-400 to-amber-600 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] tracking-wide">
            Guerreiros Místicos
          </h1>
          <p className="font-heading text-amber-200/90 text-sm sm:text-base mt-2 max-w-xl">
            Treine. Lute. Trabalhe. Colete as 7 Esferas do Dragão e domine o universo!
          </p>
        </div>
      </div>

      {/* Card de acesso */}
      <div className="flex-1 w-full max-w-md mx-auto px-4 py-8">
        <div className="bg-[#1e1710]/90 border border-amber-900/40 rounded-xl shadow-lg shadow-black/30 p-6">
          {mode === 'check-email' ? (
            <>
              <div className="text-center py-2">
                <MailCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3" aria-hidden />
                <h2 className="font-heading text-lg text-amber-100 mb-1">Confirme seu e-mail</h2>
                <p className="text-sm text-amber-200/70 leading-relaxed">
                  Enviamos um link de confirmação para{' '}
                  <span className="text-amber-100 font-semibold break-all">{email.trim()}</span>.
                </p>
                <p className="text-xs text-amber-200/50 leading-relaxed mt-2">
                  Abra o link no seu e-mail (procure também no spam) e depois volte aqui para entrar.
                  Seu apelido <span className="text-amber-200/80">{nick.trim()}</span> já está guardado.
                </p>
              </div>
              <GameButton
                size="lg"
                variant="gold"
                className="w-full mt-4"
                disabled={loading}
                onClick={() => {
                  setMode('login');
                  setPassword('');
                  setConfirm('');
                  clearError();
                }}
              >
                <LogIn className="w-4 h-4" /> Já confirmei — entrar
              </GameButton>
              <button
                onClick={() => {
                  setMode('register');
                  clearError();
                }}
                className="w-full text-xs text-amber-200/50 hover:text-amber-200/80 transition-colors font-heading py-2 mt-1"
              >
                Usar outro e-mail
              </button>
            </>
          ) : (
            <>
              {/* Alternador login/registro */}
              <div className="flex gap-1 p-1 bg-black/40 rounded-lg border border-amber-900/40 mb-5" role="tablist">
                <button
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => {
                    setMode('login');
                    clearError();
                  }}
                  className={`flex-1 font-heading text-sm py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'login'
                      ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white shadow-md shadow-orange-900/40'
                      : 'text-amber-200/60 hover:text-amber-100'
                  }`}
                >
                  <LogIn className="w-4 h-4" /> Entrar
                </button>
                <button
                  role="tab"
                  aria-selected={mode === 'register'}
                  onClick={() => {
                    setMode('register');
                    clearError();
                  }}
                  className={`flex-1 font-heading text-sm py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                    mode === 'register'
                      ? 'bg-gradient-to-b from-orange-500 to-amber-700 text-white shadow-md shadow-orange-900/40'
                      : 'text-amber-200/60 hover:text-amber-100'
                  }`}
                >
                  <UserPlus className="w-4 h-4" /> Criar conta
                </button>
              </div>

              {mode === 'register' ? (
                <p className="text-xs text-amber-200/60 leading-relaxed mb-4">
                  Crie sua conta com <span className="text-amber-100">e-mail e senha</span> para salvar seu
                  progresso <span className="text-amber-100">na nuvem</span> — ele sobrevive a qualquer
                  atualização do jogo. Cada conta pode ter até{' '}
                  <span className="text-amber-100">3 personagens</span>.
                </p>
              ) : (
                <p className="text-xs text-amber-200/60 leading-relaxed mb-4">
                  Bem-vindo de volta, guerreiro! Entre para continuar o treino de onde parou.
                </p>
              )}

              {mode === 'register' && (
                <>
                  <label htmlFor="auth-nick" className="font-heading text-amber-100 text-sm block mb-1.5">
                    Apelido
                  </label>
                  <div className="relative mb-4">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/40" aria-hidden />
                    <input
                      id="auth-nick"
                      value={nick}
                      onChange={(e) => setNick(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      maxLength={20}
                      autoComplete="nickname"
                      placeholder="Como te chamam no universo"
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              <label htmlFor="auth-email" className="font-heading text-amber-100 text-sm block mb-1.5">
                E-mail
              </label>
              <div className="relative mb-4">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/40" aria-hidden />
                <input
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  maxLength={120}
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                  className={inputClass}
                />
              </div>

              <label htmlFor="auth-password" className="font-heading text-amber-100 text-sm block mb-1.5">
                Senha{' '}
                {mode === 'register' && (
                  <span className="text-amber-200/40 text-xs">(mínimo 8 caracteres)</span>
                )}
              </label>
              <div className="relative mb-2">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/40" aria-hidden />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  maxLength={64}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'register' ? 'Pelo menos 8 caracteres' : 'Sua senha secreta'}
                  className={inputClass}
                />
              </div>

              {mode === 'register' && (
                <>
                  <label htmlFor="auth-confirm" className="font-heading text-amber-100 text-sm block mb-1.5">
                    Confirmar senha
                  </label>
                  <div className="relative mb-2">
                    <ShieldCheck
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/40"
                      aria-hidden
                    />
                    <input
                      id="auth-confirm"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      maxLength={64}
                      autoComplete="new-password"
                      placeholder="Repita a senha"
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              {error && (
                <p role="alert" className="text-red-400 text-sm mt-2 mb-2 leading-relaxed">
                  ⚠ {error}
                </p>
              )}

              {mode === 'register' && rateLimited && (
                <p className="text-xs text-amber-200/70 leading-relaxed mb-2">
                  Se você <span className="text-amber-100">já recebeu nosso e-mail de confirmação</span>, sua
                  conta já foi criada — não precisa cadastrar de novo.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setRateLimited(false);
                      setError(null);
                      setMode('check-email');
                    }}
                    className="underline text-amber-300 hover:text-amber-200 transition-colors"
                  >
                    Ver as instruções de confirmação
                  </button>
                </p>
              )}

              <GameButton
                size="lg"
                variant="gold"
                onClick={submit}
                disabled={loading || cooldown > 0}
                className="w-full mt-3"
              >
                {loading
                  ? 'Invocando Shenlon...'
                  : cooldown > 0
                  ? `Aguarde ${cooldown}s para tentar de novo`
                  : mode === 'login'
                  ? '⚔️ Entrar no universo'
                  : '🐉 Criar minha conta'}
              </GameButton>

              <div className="flex items-center gap-3 my-4" aria-hidden>
                <div className="flex-1 h-px bg-amber-900/40" />
                <span className="text-[11px] text-amber-200/40 font-heading uppercase tracking-widest">ou</span>
                <div className="flex-1 h-px bg-amber-900/40" />
              </div>

              <button
                onClick={playAsGuest}
                disabled={loading}
                className="w-full text-sm text-amber-200/60 hover:text-amber-100 transition-colors font-heading inline-flex items-center justify-center gap-1.5 py-2"
              >
                <Dices className="w-4 h-4" /> Jogar como convidado
              </button>
              <p className="text-center text-[11px] text-amber-200/40 mt-1.5 leading-snug">
                Jogue agora e use <span className="text-amber-200/70">"Salvar meu guerreiro"</span> depois para
                criar sua conta na nuvem sem perder o progresso.
              </p>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-amber-200/40 mt-4 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Conta protegida por e-mail e senha (Supabase Auth) · progresso
          salvo na nuvem
        </p>
      </div>

      <footer className="mt-auto py-4 text-center text-amber-200/30 text-xs">
        Guerreiros Místicos — um jogo de gerenciamento inspirado nos clássicos browsers games ·{' '}
        <a href="/" className="underline hover:text-amber-200/60">
          página inicial
        </a>
      </footer>
    </div>
  );
}
