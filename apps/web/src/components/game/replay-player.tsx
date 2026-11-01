/** Player card of the game page without the clock, for replays (review and library). */
export function ReplayPlayer({
  active,
  avatarUrl = null,
  label,
  name,
}: {
  active: boolean;
  avatarUrl?: string | null;
  label: string;
  name: string;
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
      </div>
    </article>
  );
}
