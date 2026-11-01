import { Chess } from 'chess.js';

import { formatUciSquares, toBrazilianSan } from '@/lib/notation';

export interface CoachPlanSuggestion {
  bestMoveUci: string | null;
  mate: number | null;
  principalVariation: string[];
}

/** Moves of the calculated line shown after the suggestion (the suggestion included). */
const SPOKEN_LINE_MOVES = 3;

function playUci(chess: Chess, uci: string) {
  return chess.move({
    from: uci.slice(0, 2),
    ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    to: uci.slice(2, 4),
  });
}

function possibleLine(fen: string, suggestion: CoachPlanSuggestion): string[] {
  if (!suggestion.bestMoveUci) return [];
  const line =
    suggestion.principalVariation[0] === suggestion.bestMoveUci
      ? suggestion.principalVariation
      : [suggestion.bestMoveUci, ...suggestion.principalVariation];
  const chess = new Chess(fen);
  const moves: string[] = [];
  for (const uci of line.slice(0, SPOKEN_LINE_MOVES)) {
    try {
      const move = playUci(chess, uci);
      if (!move) break;
      moves.push(toBrazilianSan(move.san));
    } catch {
      break;
    }
  }
  return moves;
}

export function formatCoachExplanation(
  fen: string,
  suggestion: CoachPlanSuggestion,
): string | null {
  if (!suggestion.bestMoveUci) return null;
  const chess = new Chess(fen);
  let move;
  try {
    move = playUci(chess, suggestion.bestMoveUci);
  } catch {
    return `Eu indico ${formatUciSquares(suggestion.bestMoveUci)}.`;
  }
  if (!move) return null;

  // Short on purpose: it is read aloud during the game. The Treinador speaks for itself ("eu").
  const san = toBrazilianSan(move.san);
  const isCentralPawnMove = move.piece === 'p' && ['d4', 'd5', 'e4', 'e5'].includes(move.to);
  const isDevelopment = ['b', 'n'].includes(move.piece) && ['1', '8'].includes(move.from.charAt(1));

  let idea = 'melhoro a coordenação sem assumir riscos';
  if (suggestion.mate !== null)
    idea = `conduzo o ataque até o mate em ${Math.abs(suggestion.mate)}`;
  else if (move.san.includes('x')) idea = 'ganho material com uma captura calculada';
  else if (move.san.includes('+')) idea = 'ganho tempo pressionando o rei';
  else if (move.san.startsWith('O-O')) idea = 'protejo o rei e conecto as torres';
  else if (isCentralPawnMove) idea = 'disputo o centro e libero o desenvolvimento';
  else if (isDevelopment) idea = 'coloco mais uma peça em jogo';

  const line = possibleLine(fen, suggestion);
  const forecast = line.length > 1 ? ` A linha que eu imagino é ${line.join(', ')}.` : '';
  return `Eu indico ${san}, porque assim eu ${idea}.${forecast}`;
}
