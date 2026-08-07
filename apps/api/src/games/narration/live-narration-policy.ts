export interface LiveNarrationTurn {
  coachMode: boolean;
  playerColor: 'white' | 'black';
  sideToMove: 'white' | 'black';
  status: string;
}

export function canNarrateLiveTurn(turn: LiveNarrationTurn): boolean {
  return turn.coachMode && turn.status === 'active' && turn.sideToMove === turn.playerColor;
}
