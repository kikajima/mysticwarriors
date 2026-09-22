'use client';

import { useEffect, useState } from 'react';
import type { PlayerView } from '@/lib/game/types';
import type { AccountSession } from '@/lib/auth';
import { GameButton } from './Bits';
import { User, Lock, Save, ShieldCheck, Mail, MailCheck, Cloud } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getSupabaseSession, supabaseSignUp, supabaseSignIn } from '@/lib/supabase/client';

/**
 * "Salvar meu guerreiro" (v0.8 — contas na nuvem Supabase).
 *
 * O personagem do convidado JÁ pertence à conta de convidado da sessão.
 * Ao criar a conta por e-mail, a PONTE /api/auth/supabase PROMOVE esta
 * mesma conta (vincula ao id Supabase) — nada é duplicado ou movido:
 * nível, XP, Créditos, cristais, itens, técnicas, profissões e cosméticos
 * permanecem exatamente como estão. A partir daí o progresso também é
 * sincronizado para a nuvem automaticamente.
 */
export function SaveWarriorDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (account: AccountSession, characters: PlayerView[]) => void;
}) {
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // contagem regressiva (segundos) quando o serviço de contas pede espera
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (open) {
      setNick('');
      setEmail('');
      setPassword('');
      setConfirm('');
      setError(null);
      setInfo(null);
    }
  }, [open]);

  /** Abre a sessão local via ponte — PROMOVE a conta de convidado atual. */
  const bridgeAndSave = async (nickForAccount: string): Promise<boolean> => {
    const session = await getSupabaseSession();
    if (!session) {
      setError('Não foi possível conectar sua conta. Tente novamente.');
      return false;
    }
    const res = await fetch('/api/auth/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: session.access_token, nick: nickForAccount }),
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      setError(data.error?.message ?? 'Não foi possível salvar.');
      return false;
    }
    onSaved(data.account, data.characters ?? []);
    onOpenChange(false);
    return true;
  };

  const submit = async () => {
    if (loading || cooldown > 0) return;
    setError(null);
    setInfo(null);
    if (nick.trim().length < 3) {
      setError('O apelido precisa ter pelo menos 3 caracteres.');
      return;
    }
    if (nick.trim().length > 20) {
      setError('O apelido pode ter no máximo 20 caracteres.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Digite um e-mail válido.');
      return;
    }
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const outcome = await supabaseSignUp({
        email: email.trim(),
        password,
        nick: nick.trim(),
      });

      if (outcome.status === 'error') {
        // e-mail já tem conta? tenta ENTRAR com as credenciais digitadas —
        // cobre o caso "cadastrei antes, confirmei o e-mail, voltei aqui"
        if (/já tem conta|already/i.test(outcome.message)) {
          const signInOutcome = await supabaseSignIn(email.trim(), password);
          if (signInOutcome.status === 'session') {
            await bridgeAndSave(nick.trim());
            return;
          }
          if (signInOutcome.status === 'error') {
            setError(signInOutcome.message);
            if (signInOutcome.kind === 'rate-limit') setCooldown(signInOutcome.retryInSeconds ?? 60);
          } else {
            setError('Não foi possível conectar sua conta. Tente novamente.');
          }
          return;
        }
        setError(outcome.message);
        if (outcome.kind === 'rate-limit') setCooldown(outcome.retryInSeconds ?? 60);
        return;
      }

      if (outcome.status === 'confirm-email') {
        setInfo(
          `Enviamos um link de confirmação para ${email.trim()}. Abra-o no seu e-mail (veja o spam também) e depois volte aqui para salvar — seu guerreiro continua esperando neste navegador.`
        );
        return;
      }

      await bridgeAndSave(nick.trim());
    } catch {
      setError('Falha de conexão com o servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full bg-black/40 border border-amber-800/50 rounded-lg px-4 py-2.5 text-amber-100 placeholder:text-amber-200/30 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-900/50 font-heading';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a130c] border-amber-800/60 max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-amber-100 flex items-center gap-2">
            <Save className="w-5 h-5 text-emerald-400" /> Salvar meu guerreiro
          </DialogTitle>
          <DialogDescription className="text-amber-200/60 text-xs leading-relaxed">
            Crie sua conta com <span className="text-amber-200/90">e-mail e senha</span> para garantir seu
            progresso <span className="text-emerald-300">para sempre, na nuvem</span>.{' '}
            <span className="text-emerald-300">
              Nível, XP, Créditos, cristais, atributos, itens, técnicas, profissões e cosméticos — tudo é
              preservado
            </span>{' '}
            e passa a sobreviver a qualquer atualização do jogo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div>
            <label htmlFor="save-nick" className="font-heading text-amber-100 text-sm block mb-1">
              <User className="w-3.5 h-3.5 inline mr-1" /> Apelido
            </label>
            <input
              id="save-nick"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={20}
              autoComplete="nickname"
              placeholder="Ex: guerreiro_lendario"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="save-email" className="font-heading text-amber-100 text-sm block mb-1">
              <Mail className="w-3.5 h-3.5 inline mr-1" /> E-mail
            </label>
            <input
              id="save-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              autoComplete="email"
              placeholder="voce@exemplo.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="save-password" className="font-heading text-amber-100 text-sm block mb-1">
              <Lock className="w-3.5 h-3.5 inline mr-1" /> Senha (mínimo 8 caracteres)
            </label>
            <input
              id="save-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={64}
              autoComplete="new-password"
              placeholder="Escolha uma senha forte"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="save-confirm" className="font-heading text-amber-100 text-sm block mb-1">
              <ShieldCheck className="w-3.5 h-3.5 inline mr-1" /> Confirmar senha
            </label>
            <input
              id="save-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              maxLength={64}
              autoComplete="new-password"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Repita a senha"
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="text-red-400 text-sm leading-relaxed">
              ⚠ {error}
            </p>
          )}
          {info && (
            <p role="status" className="text-emerald-300 text-sm leading-relaxed flex gap-2">
              <MailCheck className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>{info}</span>
            </p>
          )}

          <GameButton
            variant="gold"
            size="lg"
            className="w-full"
            onClick={submit}
            disabled={loading || cooldown > 0}
          >
            {loading ? (
              'Salvando...'
            ) : cooldown > 0 ? (
              `Aguarde ${cooldown}s para tentar de novo`
            ) : (
              <>
                <Cloud className="w-4 h-4" /> Salvar na nuvem
              </>
            )}
          </GameButton>
          <p className="text-center text-[11px] text-amber-200/40 leading-snug">
            Sua conta de convidado é promovida — o personagem atual continua sendo seu, sem recomeçar.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
