'use client';

import { useServerNow } from '@/lib/game/clock';
import { hpRecovery, recoveryDuration } from '@/lib/game/regenCountdown';
import type { PlayerView } from '@/lib/game/types';

export function HpRecovery({ player }: { player: PlayerView }) {
  const recovery = hpRecovery(player, useServerNow(1000));
  return (
    <p className="text-[11px] text-red-300/80 mt-2 tabular-nums">
      {!recovery ? 'Vida cheia' : recovery.fullMs === 0 ? 'Recuperação concluída' : (
        <>Próximo ponto em {recoveryDuration(recovery.nextMs)} · Vida cheia em {recoveryDuration(recovery.fullMs)}</>
      )}
    </p>
  );
}
