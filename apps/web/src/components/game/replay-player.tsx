import { POINTS_BAR_LIMIT, pointsFill } from '@/lib/move-points';

/** Player card of the game page without the clock, for replays (review and library). */
export function ReplayPlayer({
  active,
  avatarUrl = null,
  label,
  name,
  points,
}: {
  active: boolean;
  avatarUrl?: string | null;
  label: string;
  name: string;
  /** Running move points (starts at 0, negative for bad moves); shown as a counter and a bar. */
  points?: number;
}) {
  return (
    <article className={`playerCard ${active ? 'activePlayer' : ''}`}>
      <div className="playerAvatar" aria-hidden="true">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="playerAvatarImage" src={avatarUrl} />
        ) : (
          name.slice(0, 2).toUpperCase()
        )}
      </div>
      <div className="playerMeta">
        <strong title={name}>{name}</strong>
        <span>{label}</span>
        {points === undefined ? null : (
          <>
            <span className="pointsCounter">
              Pontos:{' '}
              <b
                className={
                  points < 0 ? 'pointsNegative' : points > 0 ? 'pointsPositive' : undefined
                }
              >
                {points > 0 ? `+${points}` : points}
              </b>
            </span>
            <div
              aria-label={`Barra de pontos: ${points}`}
              aria-valuemax={POINTS_BAR_LIMIT}
              aria-valuemin={-POINTS_BAR_LIMIT}
              aria-valuenow={points}
              className="pointsBar"
              role="meter"
            >
              <span
                className={points < 0 ? 'pointsBarFill pointsBarNegative' : 'pointsBarFill'}
                style={{ width: `${Math.abs(pointsFill(points)) * 50}%` }}
              />
            </div>
          </>
        )}
      </div>
    </article>
  );
}
