'use client';

import { activeCosmeticSets, dominantCosmeticSet, equippedCosmetic } from '@/lib/game/content/cosmetics';
import type { CosmeticsView, PublicCosmeticsView } from '@/lib/game/types';
import { PlayerAvatar } from './Bits';

type IdentityCosmetics = Pick<CosmeticsView, 'equipped'> | PublicCosmeticsView;

export function PublicPlayerIdentity({
  name,
  race,
  avatarUrl,
  cosmetics,
  level,
  compact = false,
  onClick,
  className = '',
}: {
  name: string;
  race: string;
  avatarUrl?: string | null;
  cosmetics?: IdentityCosmetics;
  level?: number;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const equipped = cosmetics?.equipped ?? {};
  const title = equippedCosmetic(equipped, 'title')?.titleText;
  const nameplate = equippedCosmetic(equipped, 'nameplate');
  const outfit = equippedCosmetic(equipped, 'outfit');
  const pose = equippedCosmetic(equipped, 'pose');
  const activeSets = activeCosmeticSets(equipped);
  const dominantSet = dominantCosmeticSet(equipped);

  const body = (
    <span
      className={`flex min-w-0 items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors ${
        dominantSet?.activeMilestone.identityCss ?? outfit?.identityAccentCss ?? 'border-transparent'
      } ${onClick ? 'hover:border-amber-700/50 hover:bg-amber-950/15' : ''} ${className}`}
    >
      <PlayerAvatar
        race={race}
        avatarUrl={avatarUrl}
        cosmetics={cosmetics}
        className={compact ? 'w-8 h-8' : 'w-10 h-10'}
        emojiSize={compact ? 'text-base' : 'text-xl'}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-0.5 text-left ${
            nameplate?.nameplateCss ?? 'border-transparent'
          }`}
        >
          <span className="truncate font-heading text-amber-100">{name}</span>
          {title ? <span className="truncate text-[10px] text-amber-300/80">{title}</span> : null}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-amber-200/45">
          {level !== undefined ? <span>Nv {level}</span> : null}
          {outfit?.profileBadge ? (
            <span title={outfit.name}>{outfit.profileBadge.icon} {outfit.profileBadge.label}</span>
          ) : null}
          {!compact && pose?.profileBadge ? (
            <span title={pose.name}>{pose.profileBadge.icon} {pose.profileBadge.label}</span>
          ) : null}
          {activeSets.slice(0, compact ? 1 : 2).map((progress) => (
            <span
              key={progress.set.id}
              className={`rounded-full border px-1.5 py-0.5 ${progress.activeMilestone.badgeCss}`}
              title={`${progress.set.name}: ${progress.activeMilestone.name} (${progress.equippedCount}/${progress.total} peças equipadas)`}
            >
              {progress.set.icon} {compact ? progress.activeMilestone.pieces : progress.activeMilestone.name}
            </span>
          ))}
        </span>
      </span>
    </span>
  );

  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} className="min-w-0 text-left">
      {body}
    </button>
  );
}
