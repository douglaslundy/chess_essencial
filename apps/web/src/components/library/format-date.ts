/** "1972-07-11" → "11/07/1972" (padrão brasileiro); datas parciais/fora do formato ficam como vieram. */
export function formatPlayedOn(playedOn: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(playedOn);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : playedOn;
}
