'use client';

import { useEffect, useState } from 'react';
import type { PublicPlayerProfile } from '@/lib/game/types';
import { RACES } from '@/lib/game/constants';
import { equippedCosmetic } from '@/lib/game/content/cosmetics';
import { getPowerScale } from '@/lib/game/powerScale';
import { PublicPlayerIdentity } from './PublicPlayerIdentity';
import { Chip } from './Bits';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function PublicPlayerProfileDialog({
  playerId,
  onOpenChange,
}: {
  playerId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!playerId) {
      setProfile(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/game/public-player?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? 'Falha ao carregar perfil.');
        if (!cancelled) setProfile(json.player);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const equipped = profile?.cosmetics.equipped ?? {};
  const background = equippedCosmetic(equipped, 'background');
  const card = equippedCosmetic(equipped, 'card');
  const pose = equippedCosmetic(equipped, 'pose');
  const scale = profile ? getPowerScale(profile.power).scale : null;

  return (
    <Dialog open={!!playerId} onOpenChange={onOpenChange}>
      <DialogContent
        className={`overflow-hidden border-amber-800/60 bg-[#1a130c] text-amber-100 sm:max-w-lg ${
          card?.cardGlowCss ?? ''
        }`}
      >
        {background?.profileBgCss ? (
          <div className={`pointer-events-none absolute inset-0 opacity-60 ${background.profileBgCss}`} aria-hidden />
        ) : null}
        <div className="relative">
          <DialogHeader>
            <DialogTitle className="font-heading text-amber-100">Ficha pública do guerreiro</DialogTitle>
            <DialogDescription className="text-amber-200/45">
              Identidade, progresso público e cosméticos equipados.
            </DialogDescription>
          </DialogHeader>

          {loading && !profile ? (
            <div className="py-10 text-center text-sm text-amber-200/45">Carregando guerreiro…</div>
          ) : failed ? (
            <div className="py-10 text-center text-sm text-red-300/80">Não foi possível abrir esta ficha.</div>
          ) : profile ? (
            <div className="mt-4 space-y-4">
              <PublicPlayerIdentity
                name={profile.name}
                race={profile.race}
                avatarUrl={profile.avatarUrl}
                cosmetics={profile.cosmetics}
                level={profile.level}
                className="w-full"
              />

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat label="Raça" value={RACES[profile.race]?.name ?? profile.race} />
                <Stat label="Nível" value={profile.level.toLocaleString('pt-BR')} />
                <Stat label="Poder" value={profile.power.toLocaleString('pt-BR')} />
                <Stat label="Escala" value={scale ? `${scale.emoji} ${scale.nome}` : '—'} />
                <Stat label="Vitórias" value={profile.battlesWon.toLocaleString('pt-BR')} />
                <Stat label="Derrotas" value={profile.battlesLost.toLocaleString('pt-BR')} />
                <Stat label="Vitórias no torneio" value={profile.tournamentWins.toLocaleString('pt-BR')} />
                <Stat label="Títulos do torneio" value={profile.tournamentTitles.toLocaleString('pt-BR')} />
              </div>

              <div className="flex flex-wrap gap-2">
                {profile.guild ? (
                  <Chip className="border-emerald-800/50 bg-emerald-950/50 text-emerald-300">
                    🛡️ {profile.guild.name}
                  </Chip>
                ) : null}
                {profile.transformation ? (
                  <Chip className="border-orange-800/50 bg-orange-950/50 text-orange-300">
                    {profile.transformation.icon} {profile.transformation.name}
                  </Chip>
                ) : null}
                {pose?.profileBadge ? (
                  <Chip className="border-yellow-700/50 bg-yellow-950/50 text-yellow-300">
                    {pose.profileBadge.icon} {pose.profileBadge.label}
                  </Chip>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-amber-900/30 bg-black/25 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-amber-200/35">{label}</p>
      <p className="mt-0.5 font-heading text-amber-100">{value}</p>
    </div>
  );
}
