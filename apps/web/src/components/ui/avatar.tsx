export function Avatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" className="userAvatar userAvatarImage" src={avatarUrl} />;
  }
  return (
    <span aria-hidden="true" className="userAvatar">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
