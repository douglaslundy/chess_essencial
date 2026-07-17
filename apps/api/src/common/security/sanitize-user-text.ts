export function sanitizeUserText(value: string) {
  const withoutControls = [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 9 ||
        codePoint === 10 ||
        codePoint === 13 ||
        (codePoint >= 32 && codePoint !== 127)
      );
    })
    .join('');
  return withoutControls.replace(/<[^>]*>/g, '').trim();
}
