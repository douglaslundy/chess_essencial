import { fireEvent, render, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { ChessBoard } from './chess-board';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// White pawn on e7 about to promote, otherwise empty board (plus kings, for legality).
const PROMOTION_FEN = '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1';

describe('ChessBoard', () => {
  it('exposes natural square, piece and action names to screen readers', async () => {
    const onMove = jest.fn();
    await render(<ChessBoard fen={START_FEN} onMove={onMove} />);

    const whitePawn = screen.getByTestId('square-e2');
    const emptySquare = screen.getByTestId('square-e4');
    const blackPawn = screen.getByTestId('square-e7');

    expect(whitePawn.props).toMatchObject({
      accessibilityHint: 'Seleciona esta peça para mover.',
      accessibilityLabel: 'Casa e dois, peão branco',
      accessibilityRole: 'button',
      accessibilityState: { disabled: false, selected: false },
    });
    expect(emptySquare.props.accessibilityLabel).toBe('Casa e quatro, vazia');
    expect(blackPawn.props).toMatchObject({
      accessibilityHint: 'Peça adversária. Selecione primeiro uma peça da vez.',
      accessibilityLabel: 'Casa e sete, peão preto',
    });
  });

  it('announces selection state and the destination action', async () => {
    const onMove = jest.fn();
    await render(<ChessBoard fen={START_FEN} onMove={onMove} />);

    await fireEvent.press(screen.getByTestId('square-e2'));

    expect(screen.getByTestId('square-e2').props).toMatchObject({
      accessibilityHint: 'Peça selecionada. Escolha uma casa de destino.',
      accessibilityState: { disabled: false, selected: true },
    });
    expect(screen.getByTestId('square-e4').props.accessibilityHint).toBe(
      'Move a peça selecionada para e quatro.',
    );
  });
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
    expect(screen.getByTestId('square-e2').props.accessibilityState).toEqual({
      disabled: true,
      selected: false,
    });
  });

  it('shows a promotion picker instead of moving immediately, and reports the chosen piece', async () => {
    const onMove = jest.fn();
    await render(<ChessBoard fen={PROMOTION_FEN} onMove={onMove} />);

    await fireEvent.press(screen.getByTestId('square-e7'));
    await fireEvent.press(screen.getByTestId('square-e8'));

    // The move hasn't been reported yet — it's held back for the promotion choice.
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText('Escolha a promoção').props.accessibilityRole).toBe('header');
    expect(screen.getByText('Dama')).toBeTruthy();
    expect(screen.getByText('Torre')).toBeTruthy();
    expect(screen.getByTestId('promotion-q').props.accessibilityLabel).toBe(
      'Promover peão branco para dama',
    );
    expect(screen.getByTestId('promotion-r').props).toMatchObject({
      accessibilityHint: 'Conclui o movimento de e sete para e oito com torre.',
      accessibilityLabel: 'Promover peão branco para torre',
      accessibilityRole: 'button',
    });
    expect(screen.getByTestId('square-e8').props.accessibilityState.disabled).toBe(true);

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
