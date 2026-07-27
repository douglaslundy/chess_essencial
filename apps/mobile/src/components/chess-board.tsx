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

const promotionPieces: { label: string; value: string }[] = [
  { label: 'q', value: 'q' },
  { label: 'r', value: 'r' },
  { label: 'b', value: 'b' },
  { label: 'n', value: 'n' },
];

export interface ChessBoardProps {
  disabled?: boolean;
  fen: string;
  onMove: (from: Square, to: Square, promotion?: string) => void;
  orientation?: 'white' | 'black';
}

export function ChessBoard({
  disabled = false,
  fen,
  onMove,
  orientation = 'white',
}: ChessBoardProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    color: 'w' | 'b';
    from: Square;
    to: Square;
  } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  const orderedFiles = orientation === 'black' ? [...files].reverse() : [...files];
  const orderedRanks = orientation === 'black' ? [...ranks].reverse() : [...ranks];

  function handlePress(square: Square) {
    if (disabled || !chess || pendingPromotion) return;
    const piece = chess.get(square);

    if (selected && selected !== square) {
      const movingPiece = chess.get(selected);
      const isPromotion = movingPiece?.type === 'p' && (square[1] === '1' || square[1] === '8');
      setSelected(null);
      if (isPromotion && movingPiece) {
        setPendingPromotion({ color: movingPiece.color, from: selected, to: square });
        return;
      }
      onMove(selected, square, undefined);
      return;
    }

    setSelected(piece && piece.color === chess.turn() ? square : null);
  }

  function choosePromotion(promotion: string) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    onMove(from, to, promotion);
  }

  return (
    <View>
      <View style={styles.board}>
        {orderedRanks.map((rank) => (
          <View key={rank} style={styles.row}>
            {orderedFiles.map((file) => {
              const square = `${file}${rank}` as Square;
              const isLight = (files.indexOf(file) + ranks.indexOf(rank)) % 2 === 0;
              const piece = chess?.get(square);
              const glyph = piece ? pieceGlyphs[`${piece.color}${piece.type}`] : null;
              return (
                <Pressable
                  key={square}
                  onPress={() => handlePress(square)}
                  testID={`square-${square}`}
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
      {pendingPromotion ? (
        <View style={styles.promotionRow}>
          {promotionPieces.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => choosePromotion(option.value)}
              style={[styles.promotionButton, { backgroundColor: theme.backgroundElement }]}
              testID={`promotion-${option.value}`}
            >
              <Text style={styles.piece}>
                {pieceGlyphs[`${pendingPromotion.color}${option.label}`]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
  promotionRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
  },
  promotionButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
