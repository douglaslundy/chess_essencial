import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const pieceGlyphs: Record<string, string> = {
  bb: '\u265d',
  bk: '\u265a',
  bn: '\u265e',
  bp: '\u265f',
  bq: '\u265b',
  br: '\u265c',
  wb: '\u2657',
  wk: '\u2654',
  wn: '\u2658',
  wp: '\u2659',
  wq: '\u2655',
  wr: '\u2656',
};

const pieceNames: Record<PieceSymbol, string> = {
  b: 'bispo',
  k: 'rei',
  n: 'cavalo',
  p: 'peão',
  q: 'dama',
  r: 'torre',
};

const colorNames = { b: 'preto', w: 'branco' } as const;
const rankNames: Record<string, string> = {
  '1': 'um',
  '2': 'dois',
  '3': 'três',
  '4': 'quatro',
  '5': 'cinco',
  '6': 'seis',
  '7': 'sete',
  '8': 'oito',
};

const files = 'abcdefgh';
const ranks = '87654321';

const promotionPieces: { name: string; value: Exclude<PieceSymbol, 'k' | 'p'> }[] = [
  { name: 'Dama', value: 'q' },
  { name: 'Torre', value: 'r' },
  { name: 'Bispo', value: 'b' },
  { name: 'Cavalo', value: 'n' },
];

function spokenSquare(square: Square): string {
  return `${square[0]} ${rankNames[square[1]]}`;
}

function squareLabel(square: Square, piece: ReturnType<Chess['get']>): string {
  const contents = piece ? `${pieceNames[piece.type]} ${colorNames[piece.color]}` : 'vazia';
  return `Casa ${spokenSquare(square)}, ${contents}`;
}

function squareHint(
  square: Square,
  piece: ReturnType<Chess['get']>,
  turn: 'w' | 'b',
  selected: Square | null,
  disabled: boolean,
  promotionPending: boolean,
): string {
  if (disabled) return 'Tabuleiro indisponível.';
  if (promotionPending) return 'Escolha uma peça para concluir a promoção.';
  if (selected === square) return 'Peça selecionada. Escolha uma casa de destino.';
  if (selected) return `Move a peça selecionada para ${spokenSquare(square)}.`;
  if (piece?.color === turn) return 'Seleciona esta peça para mover.';
  if (piece) return 'Peça adversária. Selecione primeiro uma peça da vez.';
  return 'Casa vazia. Selecione primeiro uma peça da vez.';
}

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

  const squaresDisabled = disabled || Boolean(pendingPromotion);

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
                  accessibilityHint={squareHint(
                    square,
                    piece,
                    chess?.turn() ?? 'w',
                    selected,
                    disabled,
                    Boolean(pendingPromotion),
                  )}
                  accessibilityLabel={squareLabel(square, piece)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: squaresDisabled, selected: selected === square }}
                  disabled={squaresDisabled}
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
                  {glyph ? (
                    <Text
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      style={styles.piece}
                    >
                      {glyph}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {pendingPromotion ? (
        <View accessibilityLabel="Escolha a peça para promoção" style={styles.promotionPanel}>
          <Text accessibilityRole="header" style={styles.promotionTitle}>
            Escolha a promoção
          </Text>
          <View style={styles.promotionRow}>
            {promotionPieces.map((option) => (
              <Pressable
                accessibilityHint={`Conclui o movimento de ${spokenSquare(pendingPromotion.from)} para ${spokenSquare(pendingPromotion.to)} com ${option.name.toLowerCase()}.`}
                accessibilityLabel={`Promover peão ${colorNames[pendingPromotion.color]} para ${option.name.toLowerCase()}`}
                accessibilityRole="button"
                key={option.value}
                onPress={() => choosePromotion(option.value)}
                style={[styles.promotionButton, { backgroundColor: theme.backgroundElement }]}
                testID={`promotion-${option.value}`}
              >
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={styles.piece}
                >
                  {pieceGlyphs[`${pendingPromotion.color}${option.value}`]}
                </Text>
                <Text style={styles.promotionName}>{option.name}</Text>
              </Pressable>
            ))}
          </View>
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
  promotionName: {
    fontSize: 12,
    fontWeight: '700',
  },
  promotionPanel: {
    gap: 8,
    marginTop: 8,
  },
  promotionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  promotionTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  promotionButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
});
