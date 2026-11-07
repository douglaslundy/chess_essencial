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

  const line = possibleLine(fen, suggestion, mode);
  const forecast = line.length > 1 ? ` A linha que eu imagino é ${line.join(', ')}.` : '';
  return `Eu indico ${san}${goal ? `, para ${goal}` : ''}.${extra && !goal?.startsWith('ameaçar') ? ` ${extra}` : ''}${forecast}`;
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
