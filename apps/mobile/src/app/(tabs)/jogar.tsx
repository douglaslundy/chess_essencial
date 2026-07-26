import type { BotDifficulty, GameState } from '@xadrez/contracts';
import type { Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChessBoard } from '@/components/chess-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { GameApiProblem, gameApi, randomMoveId } from '@/lib/api/game';

const DIFFICULTIES: { label: string; value: BotDifficulty }[] = [
  { label: 'Equilibrado (seu nível)', value: 'matched' },
  { label: 'Iniciante', value: 'beginner' },
  { label: 'Intermediário', value: 'intermediate' },
  { label: 'Avançado', value: 'advanced' },
  { label: 'Especialista', value: 'expert' },
];

const POLL_INTERVAL_MS = 3000;

function resultMessage(state: GameState, myUserId: string | undefined) {
  if (state.result === 'draw') return 'Empate.';
  const myColor = state.players.find((player) => player.userId === myUserId)?.color;
  if (!myColor) return 'Partida encerrada.';
  const won =
    (state.result === 'white_win' && myColor === 'white') ||
    (state.result === 'black_win' && myColor === 'black');
  return won ? 'Você venceu!' : 'Você perdeu.';
}

export default function JogarScreen() {
  const { user } = useAuth();
  const [game, setGame] = useState<GameState | null>(null);
  const [message, setMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (gameId: string) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        gameApi
          .getGame(gameId)
          .then((state) => {
            setGame(state);
            if (state.status === 'finished') stopPolling();
          })
          .catch(() => undefined);
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  async function startGame(botDifficulty: BotDifficulty) {
    setStarting(true);
    setMessage('');
    try {
      const state = await gameApi.createBotGame({
        botDifficulty,
        coachMode: false,
        playerColor: 'random',
        timeControlCode: 'rapid-10-0',
      });
      setGame(state);
      startPolling(state.id);
    } catch (error) {
      setMessage(error instanceof GameApiProblem ? error.message : 'Falha ao iniciar a partida.');
    } finally {
      setStarting(false);
    }
  }

  async function handleMove(from: Square, to: Square, promotion?: string) {
    if (!game) return;
    try {
      const { state } = await gameApi.submitMove(game.id, {
        clientMoveId: randomMoveId(),
        expectedVersion: game.version,
        uci: `${from}${to}${promotion ?? ''}`,
      });
      setGame(state);
      setMessage('');
      if (state.status === 'finished') stopPolling();
    } catch (error) {
      setMessage(error instanceof GameApiProblem ? error.message : 'Lance não permitido.');
    }
  }

  if (!game) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title">Jogar</ThemedText>
          <ThemedText type="small">Escolha a dificuldade do bot:</ThemedText>
          <ThemedView style={styles.difficultyList}>
            {DIFFICULTIES.map((option) => (
              <ThemedText
                key={option.value}
                onPress={starting ? undefined : () => void startGame(option.value)}
                style={styles.difficultyButton}
                type="smallBold"
              >
                {option.label}
              </ThemedText>
            ))}
          </ThemedView>
          {message ? <ThemedText type="small">{message}</ThemedText> : null}
        </SafeAreaView>
      </ThemedView>
    );
  }

  const myColor = game.players.find((player) => player.userId === user?.id)?.color ?? 'white';
  const isMyTurn = game.status === 'active' && game.sideToMove === myColor;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">
          {game.status === 'finished'
            ? resultMessage(game, user?.id)
            : isMyTurn
              ? 'Sua vez'
              : 'Vez do adversário'}
        </ThemedText>
        <ChessBoard
          disabled={game.status === 'finished' || !isMyTurn}
          fen={game.currentFen}
          onMove={handleMove}
        />
        {message ? <ThemedText type="small">{message}</ThemedText> : null}
        {game.status === 'finished' ? (
          <ThemedText
            onPress={() => {
              setGame(null);
              setMessage('');
            }}
            style={styles.difficultyButton}
            type="smallBold"
          >
            Nova partida
          </ThemedText>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.three,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  difficultyList: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  difficultyButton: {
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.two,
    color: '#fff',
    overflow: 'hidden',
    paddingVertical: Spacing.two,
    textAlign: 'center',
  },
});
