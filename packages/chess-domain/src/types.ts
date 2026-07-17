export type ChessColor = 'white' | 'black';
export type GameResult = 'white_win' | 'black_win' | 'draw' | 'none';
export type TerminationReason =
  'checkmate' | 'stalemate' | 'repetition' | 'fifty_move' | 'insufficient_material' | 'none';

export interface MoveFlags {
  capture: boolean;
  castling: 'king_side' | 'queen_side' | null;
  enPassant: boolean;
  promotion: boolean;
}

export interface PositionStatus {
  inCheck: boolean;
  isGameOver: boolean;
  result: GameResult;
  sideToMove: ChessColor;
  termination: TerminationReason;
}

export interface AppliedMove {
  color: ChessColor;
  fenAfter: string;
  fenBefore: string;
  flags: MoveFlags;
  from: string;
  promotion: string | null;
  san: string;
  status: PositionStatus;
  to: string;
  uci: string;
}

export interface ChessRules {
  applyMove(uci: string): AppliedMove;
  canWinOnTime(color: ChessColor): boolean;
  fen(): string;
  history(): readonly AppliedMove[];
  pgn(): string;
  status(): PositionStatus;
}
