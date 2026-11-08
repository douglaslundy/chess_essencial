import { describeMoveFacts, describeMoveGoal, moveFacts } from '@xadrez/chess-domain';
import { Chess } from 'chess.js';

import { formatUciSquares, spokenSan, toBrazilianSan } from '@/lib/notation';

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

function possibleLine(fen: string, suggestion: CoachPlanSuggestion, mode: Mode): string[] {
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
      moves.push(nameOf(move, mode));
    } catch {
      break;
    }
  }
  return moves;
}

type Mode = 'speech' | 'text';

const PIECE_VALUE: Record<string, number> = { b: 3, k: 0, n: 3, p: 1, q: 9, r: 5 };
const PIECE_NAME: Record<string, string> = {
  b: 'o bispo',
  k: 'o rei',
  n: 'o cavalo',
  p: 'o peão',
  q: 'a dama',
  r: 'a torre',
};

/** Squares of `victim`'s pieces the opponent could win right now (free, or for a cheaper piece). */
function threatenedSquares(fen: string, victim: 'b' | 'w'): Map<string, string> {
  const parts = fen.split(' ');
  parts[1] = victim === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const threatened = new Map<string, string>();
  try {
    const chess = new Chess(parts.join(' '));
    for (const move of chess.moves({ verbose: true })) {
      if (!move.captured || move.captured === 'k') continue;
      const defended = chess.isAttacked(move.to, victim);
      if (!defended || PIECE_VALUE[move.captured]! > PIECE_VALUE[move.piece]!) {
        threatened.set(move.to, move.captured);
      }
    }
  } catch {
    // A position that cannot be flipped (for example the side to move is in check): no threat list.
  }
  return threatened;
}

/** What the move does about the opponent's threats: saves the piece that was attacked, if any. */
function describeThreatAnswer(fen: string, uci: string): string | null {
  const chess = new Chess(fen);
  const me = chess.turn();
  const before = threatenedSquares(fen, me);
  if (before.size === 0) return null;
  let played;
  try {
    played = playUci(chess, uci);
  } catch {
    return null;
  }
  const after = threatenedSquares(chess.fen(), me);
  for (const [square, type] of before) {
    const stillThreatened = after.has(square === played.from ? played.to : square);
    if (stillThreatened) continue;
    return square === played.from
      ? `Também tira ${PIECE_NAME[type]} de ${square} do ataque do adversário.`
      : `Também resolve a ameaça do adversário a ${PIECE_NAME[type]} em ${square}.`;
  }
  return null;
}

const nameOf = (move: { from: string; san: string; to: string }, mode: Mode) =>
  mode === 'speech' ? spokenSan(move.san, move) : toBrazilianSan(move.san);

export function formatCoachExplanation(
  fen: string,
  suggestion: CoachPlanSuggestion,
  mode: Mode = 'text',
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
  const san = nameOf(move, mode);
  const facts = moveFacts(fen, suggestion.bestMoveUci);
  const goal =
    suggestion.mate !== null
      ? `conduzir o ataque até o mate em ${Math.abs(suggestion.mate)}`
      : facts
        ? describeMoveGoal(facts)
        : null;
  // Beyond the main goal, one more concrete thing the move does (what it attacks).
  const extra =
    facts && suggestion.mate === null
      ? describeMoveFacts(facts).find((line) => /^(Ataca|Ameaça)/.test(line))
      : undefined;

  const answer = describeThreatAnswer(fen, suggestion.bestMoveUci);
  const line = possibleLine(fen, suggestion, mode);
  const forecast = line.length > 1 ? ` A linha que eu imagino é ${line.join(', ')}.` : '';
  return `Eu indico ${san}${goal ? `, para ${goal}` : ''}.${extra && !goal?.startsWith('ameaçar') ? ` ${extra}` : ''}${answer ? ` ${answer}` : ''}${forecast}`;
}

/**
 * The Treinador's warning before a weak move is sent: what the move gives away, in board
 * terms, and what to play instead. Facts come from `moveFacts`, so nothing here is invented.
 */
export function formatCoachWarning(
  fen: string,
  uci: string,
  verdict: { centipawnLoss: number; label: string; missedWin: boolean },
  bestMoveUci: string | null,
  mode: Mode = 'text',
): string {
  const facts = moveFacts(fen, uci);
  const lines = facts ? describeMoveFacts(facts) : [];
  const giveaway = lines.filter((line) => line.startsWith('Deixa'));
  const parts = [`Atenção: eu acho que esse lance é ${verdict.label}.`];
  if (giveaway.length > 0) parts.push(...giveaway);
  else if (verdict.centipawnLoss >= 150) parts.push('Ele entrega boa parte da sua vantagem.');
  if (verdict.missedWin) parts.push('Havia uma posição melhor.');
  if (bestMoveUci) {
    try {
      const best = playUci(new Chess(fen), bestMoveUci);
      const goal = describeMoveGoal(moveFacts(fen, bestMoveUci)!);
      if (best) {
        parts.push(`Eu jogaria ${nameOf(best, mode)}${goal ? `, para ${goal}` : ''}.`);
      }
    } catch {
      // The suggestion no longer matches this position: the warning stands without it.
    }
  }
  return parts.join(' ');
}
