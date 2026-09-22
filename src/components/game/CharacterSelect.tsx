'use client';

import { useState } from 'react';
import { MAX_CHARACTERS_PER_ACCOUNT, RACES } from '@/lib/game/constants';
import { equippedCosmetic } from '@/lib/game/content/cosmetics';
import type { PlayerView } from '@/lib/game/types';
import type { AccountSession } from '@/lib/auth';
import { Chip, GameButton, PlayerAvatar, RACE_EMOJI, RACE_TEXT } from './Bits';
import { Plus, LogOut, Swords, User, Trash2, AlertTriangle } from 'lucide-react';

/** Título equipado do personagem (cosmético v0.5) — null quando não há. */
function titleText(p: PlayerView): string | null {
  return equippedCosmetic(p.cosmetics?.equipped ?? {}, 'title')?.titleText ?? null;
}

export function CharacterSelect({
  account,
  characters,
  onSelect,
  onCreate,
  onLogout,
  onDelete,
}: {
  account: AccountSession;
  characters: PlayerView[];
  onSelect: (player: PlayerView) => void;
  onCreate: () => void;
  onLogout: () => void;
  onDelete: (player: PlayerView) => Promise<boolean>;
}) {
  // LIMITE VALIDADO NO FRONTEND: >= 3 personagens → criação bloqueada
  const atLimit = characters.length >= MAX_CHARACTERS_PER_ACCOUNT;
  const slotsFree = !atLimit;
  const [confirming, setConfirming] = useState<PlayerView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!confirming) return;
    setDeleting(true);
    const ok = await onDelete(confirming);
    setDeleting(false);
    if (ok) setConfirming(null);
  };

  return (
    <div className="min-h-screen bg-[#14100b] flex flex-col">
      <div
        className="fixed inset-0 pointer-events-none opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(180,83,9,0.25), transparent), radial-gradient(ellipse 60% 40% at 90% 100%, rgba(120,53,15,0.15), transparent)',
        }}
        aria-hidden
      />

      <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-10 relative">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-600 tracking-wide">
              Myst Ki Warriors
            </h1>
            <p className="font-heading text-amber-200/60 text-sm mt-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Conta: <span className="text-amber-100">{account.username}</span>
            </p>
          </div>
          <GameButton variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="w-4 h-4" /> Sair da conta
          </GameButton>
        </div>

        <h2 className="font-heading text-amber-100 text-lg mt-6 mb-1">
          Escolha seu guerreiro
        </h2>
        <p className="text-xs text-amber-200/50 mb-5">
          Cada conta pode ter até {MAX_CHARACTERS_PER_ACCOUNT} personagens ({characters.length}/
          {MAX_CHARACTERS_PER_ACCOUNT} em uso). Todo o progresso fica salvo na sua conta.
        </p>

        {/* Slots de personagem */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((p) => (
            <div
              key={p.id}
              className="relative bg-[#1e1710]/90 border border-amber-900/40 rounded-xl p-5 transition-all duration-200 hover:border-orange-500 shadow-lg shadow-black/30 group"
            >
              <button
                onClick={() => onSelect(p)}
                className="text-left w-full"
                aria-label={`Jogar com ${p.name}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <PlayerAvatar
                    race={p.race}
                    avatarUrl={p.avatarUrl}
                    cosmetics={p.cosmetics}
                    className="w-14 h-14"
                    emojiSize="text-2xl"
                  />
                  <div className="min-w-0">
                    <h3 className="font-heading text-amber-100 text-lg leading-tight truncate">
                      {p.name}
                    </h3>
                    <p className={`text-xs ${RACE_TEXT[p.race] ?? 'text-amber-200/60'}`}>
                      {RACE_EMOJI[p.race]} {RACES[p.race]?.name ?? p.race}
                    </p>
                    {titleText(p) && (
                      <p className="text-[11px] text-yellow-400/80 truncate" title="Título equipado">
                        {titleText(p)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                  <div className="bg-black/30 rounded-lg py-2">
                    <p className="text-[10px] text-amber-200/40 uppercase">Nível</p>
                    <p className="font-heading text-amber-300">{p.level}</p>
                  </div>
                  <div className="bg-black/30 rounded-lg py-2">
                    <p className="text-[10px] text-amber-200/40 uppercase">Poder</p>
                    <p className="font-heading text-orange-400">{p.derived.power.toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="bg-black/30 rounded-lg py-2">
                    <p className="text-[10px] text-amber-200/40 uppercase">Créditos</p>
                    <p className="font-heading text-yellow-400">{p.zeni.toLocaleString('pt-BR')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5 flex-wrap">
                    {p.activeMission && <Chip className="bg-orange-950/60 text-orange-300 border-orange-800/50">⏳ trabalhando</Chip>}
                    {p.claimableMission && <Chip className="bg-emerald-950/60 text-emerald-300 border-emerald-700/50">🎁 pagamento pronto</Chip>}
                    {p.guild && <Chip className="bg-emerald-950/60 text-emerald-300 border-emerald-800/50">🛡 {p.guild.name}</Chip>}
                  </div>
                  <span className="font-heading text-xs text-amber-200/70 flex items-center gap-1">
                    Jogar <Swords className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>

              {/* Excluir personagem — v0.6: QUALQUER personagem pode ser
                  excluído (até o último); a CONTA nunca é apagada */}
              <button
                onClick={() => setConfirming(p)}
                title="Excluir personagem"
                aria-label={`Excluir ${p.name}`}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-amber-200/30 hover:text-red-400 hover:bg-red-950/40 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Slot de criação — bloqueado quando o limite é atingido */}
          {slotsFree ? (
            <button
              onClick={onCreate}
              className="min-h-56 border-2 border-dashed border-amber-900/50 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-amber-200/50 transition-all duration-200 hover:border-orange-500/70 hover:text-amber-100 hover:bg-orange-950/10"
            >
              <div className="w-14 h-14 rounded-full bg-black/40 border border-amber-900/40 flex items-center justify-center">
                <Plus className="w-7 h-7" />
              </div>
              <p className="font-heading text-sm">Criar novo guerreiro</p>
              <p className="text-[11px] text-amber-200/40">
                {characters.length === 0
                  ? 'Sua primeira lenda começa aqui!'
                  : `Restam ${MAX_CHARACTERS_PER_ACCOUNT - characters.length} ${MAX_CHARACTERS_PER_ACCOUNT - characters.length === 1 ? 'vaga' : 'vagas'}`}
              </p>
            </button>
          ) : (
            <div
              role="status"
              className="min-h-56 border-2 border-dashed border-red-900/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-amber-200/40 bg-red-950/10"
            >
              <div className="w-14 h-14 rounded-full bg-black/40 border border-red-900/40 flex items-center justify-center text-red-400/70">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <p className="font-heading text-sm text-red-300/80">Limite de 3 personagens atingido</p>
              <p className="text-[11px] text-center">Delete um para criar novo.</p>
              <GameButton size="sm" disabled aria-disabled="true">
                <Plus className="w-4 h-4" /> Criar Novo Guerreiro
              </GameButton>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-auto py-4 text-center text-amber-200/30 text-xs">
        Myst Ki Warriors — um jogo de gerenciamento inspirado nos clássicos browsers games
      </footer>

      {/* Confirmação de exclusão */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label={`Excluir ${confirming.name}`}
        >
          <div className="bg-[#1e1710] border border-red-900/50 rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-heading text-amber-100 text-lg">Excluir {confirming.name}?</h3>
                <p className="text-xs text-amber-200/60 mt-1 leading-relaxed">
                  Nível {confirming.level} · {RACES[confirming.race]?.name}. Todo o progresso deste
                  personagem (itens, técnicas, Créditos, profissões) será apagado para sempre. Sua
                  conta continua ativa — esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <GameButton variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={deleting}>
                Cancelar
              </GameButton>
              <GameButton variant="danger" size="sm" onClick={confirmDelete} disabled={deleting}>
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? 'Excluindo...' : 'Excluir'}
              </GameButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
