import { Chess, type Move, validateFen } from 'chess.js';

import { IllegalMoveError, InvalidFenError, InvalidUciError } from './errors.js';
import type {
  AppliedMove,
  ChessColor,
  ChessRules,
  GameResult,
  MoveFlags,
  PositionStatus,
  TerminationReason,
} from './types.js';

const UCI_PATTERN = /^(?<from>[a-h][1-8])(?<to>[a-h][1-8])(?<promotion>[qrbn])?$/;

export class ChessJsRules implements ChessRules {
  private readonly chess: Chess;
  private readonly appliedMoves: AppliedMove[] = [];

  constructor(initialFen = 'startpos', moves: readonly string[] = []) {
    if (initialFen === 'startpos') {
      this.chess = new Chess();
    } else {
      const validation = validateFen(initialFen);
      if (!validation.ok) {
        throw new InvalidFenError(validation.error);
      }
      this.chess = new Chess(initialFen);
    }

    for (const uci of moves) {
      this.applyMove(uci);
    }
  }

  applyMove(uci: string): AppliedMove {
    const parsed = UCI_PATTERN.exec(uci.toLowerCase());
    if (!parsed?.groups) {
      throw new InvalidUciError();
    }

    const from = parsed.groups.from;
    const to = parsed.groups.to;
    if (!from || !to) {
      throw new InvalidUciError();
    }

    const fenBefore = this.chess.fen();
    let move: Move;
    try {
      move = this.chess.move({
        from,
        ...(parsed.groups.promotion ? { promotion: parsed.groups.promotion } : {}),
        to,
      });
    } catch {
      throw new IllegalMoveError();
    }

    const canonicalUci = `${move.from}${move.to}${move.promotion ?? ''}`;
    const applied: AppliedMove = {
      color: this.color(move.color),
      fenAfter: this.chess.fen(),
      fenBefore,
      flags: this.flags(move),
      from: move.from,
      promotion: move.promotion ?? null,
      san: move.san,
      status: this.status(),
      to: move.to,
      uci: canonicalUci,
    };

    this.appliedMoves.push(applied);
    return applied;
  }

  canWinOnTime(color: ChessColor) {
    const target = color === 'white' ? 'w' : 'b';
    let bishops = 0;
    let knights = 0;
    for (const rank of this.chess.board()) {
      for (const piece of rank) {
        if (!piece || piece.color !== target) continue;
        if (piece.type === 'p' || piece.type === 'r' || piece.type === 'q') return true;
        if (piece.type === 'b') bishops += 1;
        if (piece.type === 'n') knights += 1;
      }
    }
    return bishops + knights >= 2;
  }

  fen() {
    return this.chess.fen();
  }

  history() {
    return this.appliedMoves.map((move) => ({
      ...move,
      flags: { ...move.flags },
      status: { ...move.status },
    }));
  }

  pgn() {
    return this.chess.pgn({ newline: '\n' });
  }

  status(): PositionStatus {
    const sideToMove = this.color(this.chess.turn());
    let result: GameResult = 'none';
    let termination: TerminationReason = 'none';

    if (this.chess.isCheckmate()) {
      result = sideToMove === 'white' ? 'black_win' : 'white_win';
      termination = 'checkmate';
    } else if (this.chess.isStalemate()) {
      result = 'draw';
      termination = 'stalemate';
    } else if (this.chess.isThreefoldRepetition()) {
      result = 'draw';
      termination = 'repetition';
    } else if (this.chess.isDrawByFiftyMoves()) {
      result = 'draw';
      termination = 'fifty_move';
    } else if (this.chess.isInsufficientMaterial()) {
      result = 'draw';
      termination = 'insufficient_material';
    }

    return {
      inCheck: this.chess.inCheck(),
      isGameOver: result !== 'none',
      result,
      sideToMove,
      termination,
    };
  }

  private color(color: 'w' | 'b'): ChessColor {
    return color === 'w' ? 'white' : 'black';
  }

  private flags(move: Move): MoveFlags {
    return {
      capture: move.isCapture() || move.isEnPassant(),
      castling: move.isKingsideCastle()
        ? 'king_side'
        : move.isQueensideCastle()
          ? 'queen_side'
          : null,
      enPassant: move.isEnPassant(),
      promotion: move.isPromotion(),
    };
  }
}
