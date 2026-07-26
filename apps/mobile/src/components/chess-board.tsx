import { Chess, type Square } from 'chess.js';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const pieceGlyphs: Record<string, string> = {
  bb: '♝',
  bk: '♚',
  bn: '♞',
  bp: '♟',
  bq: '♛',
  br: '♜',
  wb: '♗',
  wk: '♔',
  wn: '♘',
  wp: '♙',
  wq: '♕',
  wr: '♖',
};

const files = 'abcdefgh';
const ranks = '87654321';

export interface ChessBoardProps {
  disabled?: boolean;
  fen: string;
  onMove: (from: Square, to: Square, promotion?: string) => void;
}

export function ChessBoard({ disabled = false, fen, onMove }: ChessBoardProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<Square | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  function handlePress(square: Square) {
    if (disabled || !chess) return;
    const piece = chess.get(square);

    if (selected && selected !== square) {
      const movingPiece = chess.get(selected);
      const isPromotion = movingPiece?.type === 'p' && (square[1] === '1' || square[1] === '8');
      setSelected(null);
      onMove(selected, square, isPromotion ? 'q' : undefined);
      return;
    }

    setSelected(piece && piece.color === chess.turn() ? square : null);
  }

  return (
    <View style={styles.board}>
      {[...ranks].map((rank) => (
        <View key={rank} style={styles.row}>
          {[...files].map((file) => {
            const square = `${file}${rank}` as Square;
            const isLight = (files.indexOf(file) + ranks.indexOf(rank)) % 2 === 0;
            const piece = chess?.get(square);
            const glyph = piece ? pieceGlyphs[`${piece.color}${piece.type}`] : null;
            return (
              <Pressable
                key={square}
                onPress={() => handlePress(square)}
                style={[
                  styles.square,
                  {
                    backgroundColor:
                      selected === square
                        ? theme.backgroundSelected
                        : isLight
                          ? theme.backgroundElement
                          : theme.background,
                  },
                ]}
              >
                {glyph ? <Text style={styles.piece}>{glyph}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'center',
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#52525b',
    width: '100%',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  square: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  piece: {
    fontSize: 28,
  },
});
