import { Chess } from 'chess.js';

import { formatUciSquares, toBrazilianSan } from '@/lib/notation';

export interface CoachPlanSuggestion {
  bestMoveUci: string | null;
  mate: number | null;
  principalVariation: string[];
}

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
  for (const uci of line.slice(0, 7)) {
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
    return `Eu sugiro ${formatUciSquares(suggestion.bestMoveUci)}. O motor encontrou esse lance como a melhor continuação, mas não foi possível detalhar o plano.`;
  }
  if (!move) return null;

  const san = toBrazilianSan(move.san);
  const isCentralPawnMove = move.piece === 'p' && ['d4', 'd5', 'e4', 'e5'].includes(move.to);
  const isDevelopment = ['b', 'n'].includes(move.piece) && ['1', '8'].includes(move.from.charAt(1));

  let objective = 'melhorar a coordenação e conservar opções';
  let theme = 'jogada posicional, sem combinação forçada confirmada';
  let strategy = 'aumentar gradualmente a atividade antes de assumir riscos';
  if (suggestion.mate !== null) {
    objective = `conduzir o ataque até o mate em ${Math.abs(suggestion.mate)}`;
    theme = 'ataque forçado ao rei';
    strategy = 'manter a iniciativa e restringir as defesas';
  } else if (move.san.includes('x')) {
    objective = 'melhorar o balanço material com uma captura calculada';
    theme = 'captura e tática de material';
    strategy = 'converter a oportunidade sem abandonar a segurança';
  } else if (move.san.includes('+')) {
    objective = 'ganhar tempo com pressão direta sobre o rei';
    theme = 'ataque com xeque';
    strategy = 'usar a iniciativa para limitar as respostas';
  } else if (move.san.startsWith('O-O')) {
    objective = 'proteger o rei e conectar as torres';
    theme = 'segurança do rei';
    strategy = 'concluir o desenvolvimento antes de abrir o jogo';
  } else if (isCentralPawnMove) {
    objective = 'disputar espaço e liberar o desenvolvimento';
    theme = 'controle do centro';
    strategy = 'ocupar casas centrais e preparar a mobilização das peças';
  } else if (isDevelopment) {
    objective = 'desenvolver uma peça com ganho de atividade';
    theme = 'desenvolvimento e coordenação';
    strategy = 'colocar as peças em jogo antes de iniciar operações táticas';
  }

  const trap =
    suggestion.mate !== null
      ? 'a ameaça principal é a sequência forçada de mate'
      : 'nenhuma armadilha forçada foi confirmada; observe respostas imprecisas';
  const line = possibleLine(fen, suggestion);
  const forecast =
    line.length > 1
      ? ` Linha possível calculada: ${line.join(', ')}.`
      : ' O motor ainda não confirmou uma linha futura suficientemente estável.';

  return `Eu sugiro ${san}. Objetivo: ${objective}. Tema: ${theme}. Estratégia: ${strategy}. Armadilha: ${trap}.${forecast}`;
}
