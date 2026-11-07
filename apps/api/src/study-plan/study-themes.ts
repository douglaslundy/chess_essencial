import type { StudyTheme } from '@xadrez/contracts';

/** A theme before the database says whether exercises exist for it. */
export type ThemeDraft = Omit<StudyTheme, 'hasExercises'>;

export interface MoveStat {
  color: 'black' | 'white';
  missedWin: boolean;
  ply: number;
  quality: 'bom' | 'erro' | 'excelente' | 'gafe' | 'imprecisao' | 'otimo';
}

/** Exercise tags (the course's tag vocabulary) and library-game shape that train each theme. */
export const THEME_CATALOG = {
  endgame: {
    focus: 'Veja como a vantagem é convertida com técnica nos finais.',
    label: 'Finais de partida',
    library: { maxPly: 400, minPly: 80 },
    tags: [
      'final',
      'finais',
      'endgame',
      'pawnEndgame',
      'rookEndgame',
      'promocao',
      'promotion',
      'oposicao',
    ],
  },
  opening: {
    focus: 'Observe o desenvolvimento rápido e a luta pelo centro nos primeiros lances.',
    label: 'Princípios da abertura',
    library: { maxPly: 60, minPly: 30 },
    tags: ['abertura', 'opening', 'desenvolvimento', 'centro'],
  },
  safety: {
    focus: 'Repare como cada lance é checado contra a resposta do adversário.',
    label: 'Segurança do lance (evitar gafes)',
    library: { maxPly: 60, minPly: 24 },
    tags: [
      'defesa',
      'defensiveMove',
      'peca_pendurada',
      'hangingPiece',
      'salvar_o_rei',
      'interposicao',
      'capturingDefender',
    ],
  },
  tactics: {
    focus: 'Procure o golpe tático que decide a partida e veja como ele foi preparado.',
    label: 'Percepção tática',
    library: { maxPly: 50, minPly: 24 },
    tags: [
      'garfo',
      'fork',
      'cravada',
      'pin',
      'espeto',
      'skewer',
      'ataque_duplo',
      'discoveredAttack',
      'mate',
      'mateIn1',
      'mateIn2',
      'sacrificio',
      'sacrifice',
    ],
  },
} as const;
export type ThemeKey = keyof typeof THEME_CATALOG;

const normalize = (tag: string) => tag.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The registered exercise tags (from the database) that train a theme: a tag matches when it
 * equals a candidate once case and separators are ignored. Empty means no exercise exists for it.
 */
export function matchTags(candidates: readonly string[], available: readonly string[]): string[] {
  const wanted = new Set(candidates.map(normalize));
  return available.filter((tag) => wanted.has(normalize(tag)));
}

const phaseOf = (ply: number): 'endgame' | 'middlegame' | 'opening' =>
  ply <= 20 ? 'opening' : ply <= 60 ? 'middlegame' : 'endgame';

/**
 * Picks up to three study themes from the player's own moves: unsafe moves (erro/gafe), missed
 * wins (tactics) and the phase where most of the mistakes happened. Only counts the player's side.
 */
export function pickThemes(moves: readonly MoveStat[], color: 'black' | 'white'): ThemeDraft[] {
  const mine = moves.filter((move) => move.color === color);
  const bad = mine.filter((move) => ['erro', 'gafe', 'imprecisao'].includes(move.quality));
  const serious = mine.filter((move) => move.quality === 'erro' || move.quality === 'gafe');
  const missed = mine.filter((move) => move.missedWin);
  const themes: ThemeDraft[] = [];

  if (serious.length > 0) {
    themes.push({
      key: 'safety',
      label: THEME_CATALOG.safety.label,
      reason: `Você teve ${serious.length} ${serious.length === 1 ? 'erro grave' : 'erros graves'} (erro ou gafe): antes de jogar, olhe o que o adversário captura ou ameaça.`,
    });
  }
  if (missed.length > 0) {
    themes.push({
      key: 'tactics',
      label: THEME_CATALOG.tactics.label,
      reason: `Você deixou passar ${missed.length} ${missed.length === 1 ? 'oportunidade' : 'oportunidades'} de ganhar vantagem: treine reconhecer garfos, cravadas e xeques.`,
    });
  }
  if (bad.length > 0) {
    const byPhase = { endgame: 0, middlegame: 0, opening: 0 };
    for (const move of bad) byPhase[phaseOf(move.ply)] += 1;
    const [phase, count] = Object.entries(byPhase).sort((a, b) => b[1] - a[1])[0]! as [
      keyof typeof byPhase,
      number,
    ];
    if (phase !== 'middlegame' && count > 0) {
      const key = phase === 'opening' ? 'opening' : 'endgame';
      themes.push({
        key,
        label: THEME_CATALOG[key].label,
        reason: `${count} dos seus lances imprecisos ou errados aconteceram ${phase === 'opening' ? 'na abertura' : 'no final'}.`,
      });
    }
  }
  if (themes.length === 0) {
    themes.push({
      key: 'tactics',
      label: THEME_CATALOG.tactics.label,
      reason: 'Você jogou bem: para continuar evoluindo, treine táticas mais difíceis.',
    });
  }
  return themes.slice(0, 3);
}
