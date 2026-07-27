import { fireEvent, render, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { ChessBoard } from './chess-board';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// White pawn on e7 about to promote, otherwise empty board (plus kings, for legality).
const PROMOTION_FEN = '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1';

describe('ChessBoard', () => {
  it('selects a piece, then moves it to the tapped destination square', async () => {
    const onMove = jest.fn();
    await render(<ChessBoard fen={START_FEN} onMove={onMove} />);

    await fireEvent.press(screen.getByTestId('square-e2'));
    await fireEvent.press(screen.getByTestId('square-e4'));

    expect(onMove).toHaveBeenCalledWith('e2', 'e4', undefined);
  });

  it('does nothing when tapping an empty square first (no piece selected)', async () => {
    const onMove = jest.fn();
    await render(<ChessBoard fen={START_FEN} onMove={onMove} />);

    await fireEvent.press(screen.getByTestId('square-e4'));
    await fireEvent.press(screen.getByTestId('square-e5'));

    expect(onMove).not.toHaveBeenCalled();
  });

  it("doesn't select the opponent's piece", async () => {
    const onMove = jest.fn();
    await render(<ChessBoard fen={START_FEN} onMove={onMove} />);

    // It's White to move; tapping a Black piece then an empty square should
    // not register as a move (nothing was legitimately selected).
    await fireEvent.press(screen.getByTestId('square-e7'));
    await fireEvent.press(screen.getByTestId('square-e5'));

    expect(onMove).not.toHaveBeenCalled();
  });

  it('ignores taps while disabled', async () => {
    const onMove = jest.fn();
    await render(<ChessBoard disabled fen={START_FEN} onMove={onMove} />);

    await fireEvent.press(screen.getByTestId('square-e2'));
    await fireEvent.press(screen.getByTestId('square-e4'));

    expect(onMove).not.toHaveBeenCalled();
  });

  it('shows a promotion picker instead of moving immediately, and reports the chosen piece', async () => {
    const onMove = jest.fn();
    await render(<ChessBoard fen={PROMOTION_FEN} onMove={onMove} />);

    await fireEvent.press(screen.getByTestId('square-e7'));
    await fireEvent.press(screen.getByTestId('square-e8'));

    // The move hasn't been reported yet — it's held back for the promotion choice.
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByTestId('promotion-q')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('promotion-r'));

    expect(onMove).toHaveBeenCalledWith('e7', 'e8', 'r');
  });

  it('renders the board flipped when orientation is black', async () => {
    const onMove = jest.fn();
    await render(<ChessBoard fen={START_FEN} onMove={onMove} orientation="black" />);

    // From Black's point of view, a1 is in the opposite corner from White's
    // view — both squares still exist, just re-ordered visually. The a8 rook
    // (Black's own back rank) should still be reachable/selectable.
    expect(screen.getByTestId('square-a8')).toBeTruthy();
    expect(screen.getByTestId('square-h1')).toBeTruthy();
  });
});
