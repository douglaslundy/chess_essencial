import type { PlayedMove } from './move-path';
import { toBrazilianSan } from '@/lib/notation';

/** Fading move label; remounts per move (key) so the 2 s fade restarts every time. */
export function MoveToast({ move }: { move: PlayedMove | null }) {
  if (!move) return null;
  return (
    <span aria-hidden="true" className="moveToast" key={move.id}>
      {toBrazilianSan(move.san)}
    </span>
  );
}
