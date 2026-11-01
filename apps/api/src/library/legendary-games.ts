/**
 * Hand-picked legendary games. Matched by players, year and round (exactly one library row each,
 * checked against production), because library ids are regenerated on every import.
 * Name prefixes are lowercase, as `lower(white|black) LIKE prefix || '%'`.
 */
export interface LegendaryGame {
  black: string;
  round: string;
  white: string;
  year: number;
}

export const LEGENDARY_GAMES: LegendaryGame[] = [
  // Fischer–Spassky, Mundial 1972, partida 6: a "sinfonia" de Fischer.
  { black: 'spassky', round: '6', white: 'fischer', year: 1972 },
  // Karpov–Kasparov, Mundial 1985, partida 16: o polvo do cavalo em d3.
  { black: 'kasparov', round: '16', white: 'karpov', year: 1985 },
  // Karpov–Kasparov, Mundial 1985, partida 24: Kasparov vira campeão.
  { black: 'kasparov', round: '24', white: 'karpov', year: 1985 },
  // Kasparov–Karpov, Sevilha 1987, partida 24: vitória obrigatória para manter o título.
  { black: 'karpov', round: '24', white: 'kasparov', year: 1987 },
  // Kasparov–Anand, Mundial PCA 1995, partida 10.
  { black: 'anand', round: '10', white: 'kasparov', year: 1995 },
  // Shirov–Topalov, Linares 1998: o lance Bh3!!
  { black: 'topalov', round: '3', white: 'shirov', year: 1998 },
  // Kasparov–Topalov, Wijk aan Zee (Hoogovens) 1999: a "imortal" de Kasparov.
  { black: 'topalov', round: '4', white: 'kasparov', year: 1999 },
  // Polgar–Kasparov, Rússia x Resto do Mundo 2002: primeira vitória de Judit sobre Kasparov.
  { black: 'kasparov', round: '5', white: 'polgar', year: 2002 },
  // Aronian–Anand, Wijk aan Zee 2013: a "imortal" de Anand.
  { black: 'anand', round: '4.5', white: 'aronian', year: 2013 },
  // Carlsen–Karjakin, desempate do Mundial 2016: o fecho com Dh6+.
  { black: 'karjakin', round: '4', white: 'carlsen', year: 2016 },
  // Ding–Gukesh, Mundial 2024, partida 14: Gukesh vira o campeão mais jovem.
  { black: 'gukesh', round: '14.1', white: 'ding', year: 2024 },
];
