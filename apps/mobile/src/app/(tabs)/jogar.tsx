import type {
  BotDifficulty,
  DirectChallengesView,
  Friend,
  GameState,
  TimeControlCode,
} from '@xadrez/contracts';
import type { Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChessBoard } from '@/components/chess-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { GameApiProblem, gameApi } from '@/lib/api/game';
import { getRealtimeAccessToken } from '@/lib/api/client';
import { getAccessToken } from '@/lib/api/session';
import { socialApi } from '@/lib/api/social';
import { GameSocket } from '@/lib/realtime/game-socket';

const DIFFICULTIES: { label: string; value: BotDifficulty }[] = [
  { label: 'Equilibrado (seu nível)', value: 'matched' },
  { label: 'Iniciante', value: 'beginner' },
  { label: 'Intermediário', value: 'intermediate' },
  { label: 'Avançado', value: 'advanced' },
  { label: 'Especialista', value: 'expert' },
];

// Same grouping as apps/web/src/app/app/jogar/page.tsx's GroupedListbox data
// (pool -> options), rendered here as a modal picker with section headers
// instead of a flat chip row.
const TIME_CONTROLS: { code: TimeControlCode; detail: string; label: string; pool: string }[] = [
  { code: 'bullet-1-0', detail: 'Ultrarrápida · 1 min', label: '1 + 0', pool: 'Bullet' },
  { code: 'bullet-2-1', detail: 'Ultrarrápida · +1s/lance', label: '2 + 1', pool: 'Bullet' },
  { code: 'blitz-3-0', detail: 'Muito rápida · 3 min', label: '3 + 0', pool: 'Blitz' },
  { code: 'blitz-3-2', detail: 'Muito rápida · +2s/lance', label: '3 + 2', pool: 'Blitz' },
  { code: 'rapid-10-0', detail: 'Mais tempo para pensar', label: '10 + 0', pool: 'Rápida' },
  { code: 'rapid-15-10', detail: 'Reflexiva · +10s/lance', label: '15 + 10', pool: 'Rápida' },
  {
    code: 'classical-30-0',
    detail: 'Longa e profunda · 30 min',
    label: '30 + 0',
    pool: 'Clássica',
  },
  {
    code: 'untimed',
    detail: 'Jogo livre, sem relógio · não ranqueado',
    label: 'Sem tempo',
    pool: 'Livre',
  },
];

const TIME_CONTROL_POOLS = Array.from(
  TIME_CONTROLS.reduce((pools, control) => {
    const group = pools.get(control.pool) ?? [];
    group.push(control);
    pools.set(control.pool, group);
    return pools;
  }, new Map<string, typeof TIME_CONTROLS>()),
).map(([pool, options]) => ({ options, pool }));

const POLL_INTERVAL_MS = 3000;

type LobbyMode = 'bot' | 'online' | 'challenges';

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
  const theme = useTheme();
  const [mode, setMode] = useState<LobbyMode>('bot');
  const [game, setGame] = useState<GameState | null>(null);
  const [message, setMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [timeControl, setTimeControl] = useState<TimeControlCode>('rapid-10-0');
  const [timeControlPickerOpen, setTimeControlPickerOpen] = useState(false);
  const [searchingOnline, setSearchingOnline] = useState(false);

  const [challenges, setChallenges] = useState<DirectChallengesView | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [challengeFriendId, setChallengeFriendId] = useState<string | null>(null);

  const [resignConfirmOpen, setResignConfirmOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const queueCancelledRef = useRef(false);
  const socketRef = useRef<GameSocket | null>(null);
  const [connection, setConnection] = useState<
    'connecting' | 'online' | 'reconnecting' | 'offline'
  >('connecting');

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // The in-game connection is a live WebSocket (GameSocket), not polling —
  // see the effect below keyed on game?.id. This just tracks whether a game
  // is active; searchOnline/loadChallenges below still poll REST, since the
  // realtime protocol only covers an already-created game, not matchmaking.
  useEffect(() => {
    if (!game) return;
    setConnection('connecting');
    const socket = new GameSocket(game.id, getRealtimeAccessToken, game.version, {
      connection: setConnection,
      drawOffered: (_offerId, offeredByUserId, snapshot) => {
        setGame(snapshot);
        if (offeredByUserId !== user?.id) {
          setMessage('Seu adversário ofereceu empate. Use "Propor empate" para aceitar.');
        }
      },
      snapshot: (snapshot) => {
        setGame(snapshot);
        setMessage('');
      },
      move: (snapshot) => {
        setGame(snapshot);
        setMessage('');
      },
      finished: (snapshot) => {
        setGame(snapshot);
      },
      error: setMessage,
    });
    socketRef.current = socket;
    socket.connect();
    return () => {
      socket.stop();
      socketRef.current = null;
    };
    // Reconnecting only when the game identity changes (not on every state
    // update the socket itself produces) — game.version is only read once,
    // as the connection's starting point.
  }, [game?.id]);

  async function startBotGame(botDifficulty: BotDifficulty) {
    setStarting(true);
    setMessage('');
    try {
      const state = await gameApi.createBotGame({
        botDifficulty,
        coachMode: false,
        playerColor: 'random',
        timeControlCode: timeControl,
      });
      setGame(state);
    } catch (error) {
      setMessage(error instanceof GameApiProblem ? error.message : 'Falha ao iniciar a partida.');
    } finally {
      setStarting(false);
    }
  }

  // "Entrar ou renovar presença na fila": each call either matches
  // immediately or renews the slot, so this loop calls it repeatedly and
  // only stops once a gameId comes back or the user cancels.
  const searchOnline = useCallback(() => {
    setSearchingOnline(true);
    setMessage('Procurando um adversário online…');
    stopPolling();
    queueCancelledRef.current = false;
    pollRef.current = setInterval(async () => {
      try {
        const status = await gameApi.joinQueue({
          botDifficulty: 'matched',
          fallbackToBot: false,
          playerColor: 'random',
          timeControlCode: timeControl,
        });
        if (queueCancelledRef.current) return;
        if (status.gameId) {
          stopPolling();
          setSearchingOnline(false);
          const state = await gameApi.getGame(status.gameId);
          if (queueCancelledRef.current) return;
          setGame(state);
        }
      } catch {
        // Keep trying on the next tick; a transient failure here isn't fatal.
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, timeControl]);

  async function cancelOnlineSearch() {
    queueCancelledRef.current = true;
    stopPolling();
    setSearchingOnline(false);
    setMessage('');
    try {
      await gameApi.leaveQueue();
    } catch {
      // Nothing actionable if leaving the queue fails silently server-side.
    }
  }

  const loadChallenges = useCallback(async () => {
    try {
      setChallenges(await gameApi.listChallenges());
    } catch (error) {
      setMessage(error instanceof GameApiProblem ? error.message : 'Falha ao carregar desafios.');
    }
  }, []);

  useEffect(() => {
    if (mode !== 'challenges' || game) return;
    void loadChallenges();
    if (!friends) {
      void (async () => {
        const token = await getAccessToken();
        if (!token) return;
        try {
          setFriends(await socialApi.listFriends(token));
        } catch {
          setFriends([]);
        }
      })();
    }
    const interval = setInterval(() => void loadChallenges(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [mode, game, friends, loadChallenges]);

  async function createChallenge() {
    if (!challengeFriendId) return;
    setActionBusy(true);
    try {
      const result = await gameApi.createChallenge({
        challengedUserId: challengeFriendId,
        challengerColor: null,
        timeControlCode: timeControl,
      });
      if (result.gameId) {
        const state = await gameApi.getGame(result.gameId);
        setGame(state);
      } else {
        setMessage('Desafio enviado.');
        await loadChallenges();
      }
    } catch (error) {
      setMessage(error instanceof GameApiProblem ? error.message : 'Falha ao enviar o desafio.');
    } finally {
      setActionBusy(false);
    }
  }

  async function respondChallenge(challengeId: string, accept: boolean) {
    setActionBusy(true);
    try {
      const result = await gameApi.respondChallenge(challengeId, accept);
      if (result.gameId) {
        const state = await gameApi.getGame(result.gameId);
        setGame(state);
      } else {
        await loadChallenges();
      }
    } catch (error) {
      setMessage(error instanceof GameApiProblem ? error.message : 'Falha ao responder o desafio.');
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelChallenge(challengeId: string) {
    setActionBusy(true);
    try {
      await gameApi.cancelChallenge(challengeId);
      await loadChallenges();
    } catch (error) {
      setMessage(error instanceof GameApiProblem ? error.message : 'Falha ao cancelar o desafio.');
    } finally {
      setActionBusy(false);
    }
  }

  // Moves go out over the live WebSocket connection (matches the web app's
  // approach); the resulting state comes back through the socket's `move`
  // handler above, not as a direct response here.
  function handleMove(from: Square, to: Square, promotion?: string) {
    if (!game) return;
    socketRef.current?.submitMove(`${from}${to}${promotion ?? ''}`);
  }

  async function handleResign() {
    if (!game) return;
    setActionBusy(true);
    try {
      const state = await gameApi.resign(game.id);
      setGame(state);
      setMessage('Partida encerrada por desistência.');
    } catch (error) {
      setMessage(error instanceof GameApiProblem ? error.message : 'Falha ao desistir.');
    } finally {
      setActionBusy(false);
      setResignConfirmOpen(false);
    }
  }

  async function handleOfferDraw() {
    if (!game) return;
    setActionBusy(true);
    try {
      const result = await gameApi.offerDraw(game.id);
      setGame(result.state);
      setMessage(
        result.accepted ? 'Empate aceito. A partida foi encerrada.' : 'Oferta de empate enviada.',
      );
    } catch (error) {
      setMessage(
        error instanceof GameApiProblem ? error.message : 'Não foi possível propor empate.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  function backToLobby() {
    setGame(null);
    setMessage('');
    setChallengeFriendId(null);
  }

  const selectedTimeControl =
    TIME_CONTROLS.find((option) => option.code === timeControl) ?? TIME_CONTROLS[0]!;

  if (game) {
    const myColor = game.players.find((player) => player.userId === user?.id)?.color ?? 'white';
    const isMyTurn = game.status === 'active' && game.sideToMove === myColor;
    const isFinished = game.status === 'finished';

    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle">
            {isFinished
              ? resultMessage(game, user?.id)
              : isMyTurn
                ? 'Sua vez'
                : 'Vez do adversário'}
          </ThemedText>
          {!isFinished && connection !== 'online' ? (
            <ThemedText themeColor="textSecondary" type="small">
              {connection === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}
            </ThemedText>
          ) : null}
          <ChessBoard
            disabled={isFinished || !isMyTurn}
            fen={game.currentFen}
            onMove={handleMove}
            orientation={myColor}
          />
          {message ? <ThemedText type="small">{message}</ThemedText> : null}
          {!isFinished ? (
            <View style={styles.gameActions}>
              <Pressable
                disabled={actionBusy}
                onPress={() => void handleOfferDraw()}
                style={styles.secondaryButton}
              >
                <ThemedText type="smallBold">Propor empate</ThemedText>
              </Pressable>
              <Pressable
                disabled={actionBusy}
                onPress={() => setResignConfirmOpen(true)}
                style={styles.dangerButton}
              >
                <ThemedText style={styles.buttonLabel} type="smallBold">
                  Desistir
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
          {resignConfirmOpen ? (
            <ThemedView style={styles.confirmCard} type="backgroundElement">
              <ThemedText type="small">Tem certeza que quer desistir desta partida?</ThemedText>
              <View style={styles.gameActions}>
                <Pressable
                  disabled={actionBusy}
                  onPress={() => setResignConfirmOpen(false)}
                  style={styles.secondaryButton}
                >
                  <ThemedText type="smallBold">Cancelar</ThemedText>
                </Pressable>
                <Pressable
                  disabled={actionBusy}
                  onPress={() => void handleResign()}
                  style={styles.dangerButton}
                >
                  <ThemedText style={styles.buttonLabel} type="smallBold">
                    Confirmar
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          ) : null}
          {isFinished ? (
            <Pressable onPress={backToLobby} style={styles.primaryButton}>
              <ThemedText style={styles.buttonLabel} type="smallBold">
                Nova partida
              </ThemedText>
            </Pressable>
          ) : null}
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Jogar</ThemedText>

        <View style={styles.modeRow}>
          {(
            [
              { label: 'Bot', value: 'bot' },
              { label: 'Online', value: 'online' },
              { label: 'Desafios', value: 'challenges' },
            ] as const
          ).map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                if (searchingOnline) void cancelOnlineSearch();
                setMode(option.value);
              }}
              style={[styles.modeButton, mode === option.value && styles.modeButtonActive]}
            >
              <ThemedText type="smallBold">{option.label}</ThemedText>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => setTimeControlPickerOpen(true)} style={styles.timeControlButton}>
          <ThemedText themeColor="textSecondary" type="small">
            Controle de tempo
          </ThemedText>
          <ThemedText type="smallBold">
            {selectedTimeControl.pool} {selectedTimeControl.label}
          </ThemedText>
        </Pressable>

        <Modal
          animationType="slide"
          onRequestClose={() => setTimeControlPickerOpen(false)}
          transparent
          visible={timeControlPickerOpen}
        >
          <Pressable onPress={() => setTimeControlPickerOpen(false)} style={styles.overlayBackdrop}>
            <Pressable onPress={() => undefined} style={styles.pickerCardWrapper}>
              <ThemedView style={styles.pickerCard} type="backgroundElement">
                <ThemedText type="subtitle">Controle de tempo</ThemedText>
                <ScrollView>
                  {TIME_CONTROL_POOLS.map((group) => (
                    <View key={group.pool} style={styles.pickerGroup}>
                      <ThemedText themeColor="textSecondary" type="smallBold">
                        {group.pool}
                      </ThemedText>
                      {group.options.map((option) => (
                        <Pressable
                          key={option.code}
                          onPress={() => {
                            setTimeControl(option.code);
                            setTimeControlPickerOpen(false);
                          }}
                          style={[
                            styles.pickerOption,
                            timeControl === option.code && {
                              backgroundColor: theme.backgroundSelected,
                            },
                          ]}
                        >
                          <ThemedText type="smallBold">{option.label}</ThemedText>
                          <ThemedText themeColor="textSecondary" type="small">
                            {option.detail}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>

        {mode === 'bot' ? (
          <View style={styles.difficultyList}>
            {DIFFICULTIES.map((option) => (
              <Pressable
                key={option.value}
                disabled={starting}
                onPress={() => void startBotGame(option.value)}
                style={styles.primaryButton}
              >
                <ThemedText style={styles.buttonLabel} type="smallBold">
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {mode === 'online' ? (
          <View style={styles.difficultyList}>
            {searchingOnline ? (
              <Pressable onPress={() => void cancelOnlineSearch()} style={styles.dangerButton}>
                <ThemedText style={styles.buttonLabel} type="smallBold">
                  Cancelar busca
                </ThemedText>
              </Pressable>
            ) : (
              <Pressable onPress={searchOnline} style={styles.primaryButton}>
                <ThemedText style={styles.buttonLabel} type="smallBold">
                  Buscar adversário
                </ThemedText>
              </Pressable>
            )}
          </View>
        ) : null}

        {mode === 'challenges' ? (
          <View style={styles.difficultyList}>
            <ThemedText type="smallBold">Desafiar um amigo</ThemedText>
            <View style={styles.friendRow}>
              {(friends ?? []).map((friend) => (
                <Pressable
                  key={friend.userId}
                  onPress={() => setChallengeFriendId(friend.userId)}
                  style={[
                    styles.timeControlChip,
                    challengeFriendId === friend.userId && styles.timeControlChipActive,
                  ]}
                >
                  <ThemedText type="small">{friend.displayName}</ThemedText>
                </Pressable>
              ))}
              {friends && friends.length === 0 ? (
                <ThemedText type="small">Você ainda não tem amigos adicionados.</ThemedText>
              ) : null}
            </View>
            <Pressable
              disabled={!challengeFriendId || actionBusy}
              onPress={() => void createChallenge()}
              style={styles.primaryButton}
            >
              <ThemedText style={styles.buttonLabel} type="smallBold">
                Enviar desafio
              </ThemedText>
            </Pressable>

            {challenges && challenges.incoming.length > 0 ? (
              <>
                <ThemedText type="smallBold">Desafios recebidos</ThemedText>
                {challenges.incoming.map((challenge) => (
                  <ThemedView
                    key={challenge.id}
                    style={styles.challengeCard}
                    type="backgroundElement"
                  >
                    <ThemedText type="small">{challenge.counterpart.displayName}</ThemedText>
                    <View style={styles.gameActions}>
                      <Pressable
                        disabled={actionBusy}
                        onPress={() => void respondChallenge(challenge.id, true)}
                        style={styles.secondaryButton}
                      >
                        <ThemedText type="smallBold">Aceitar</ThemedText>
                      </Pressable>
                      <Pressable
                        disabled={actionBusy}
                        onPress={() => void respondChallenge(challenge.id, false)}
                        style={styles.dangerButton}
                      >
                        <ThemedText style={styles.buttonLabel} type="smallBold">
                          Recusar
                        </ThemedText>
                      </Pressable>
                    </View>
                  </ThemedView>
                ))}
              </>
            ) : null}

            {challenges && challenges.outgoing.length > 0 ? (
              <>
                <ThemedText type="smallBold">Desafios enviados</ThemedText>
                {challenges.outgoing.map((challenge) => (
                  <ThemedView
                    key={challenge.id}
                    style={styles.challengeCard}
                    type="backgroundElement"
                  >
                    <ThemedText type="small">{challenge.counterpart.displayName}</ThemedText>
                    <Pressable
                      disabled={actionBusy}
                      onPress={() => void cancelChallenge(challenge.id)}
                      style={styles.dangerButton}
                    >
                      <ThemedText style={styles.buttonLabel} type="smallBold">
                        Cancelar
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        {message ? <ThemedText type="small">{message}</ThemedText> : null}
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
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  modeButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  modeButtonActive: {
    backgroundColor: '#3c87f733',
  },
  timeControlButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderColor: '#8888',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  overlayBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerCard: {
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    gap: Spacing.two,
    maxHeight: '100%',
    padding: Spacing.four,
  },
  pickerCardWrapper: {
    maxHeight: '80%',
    width: '100%',
  },
  pickerGroup: {
    gap: Spacing.one,
    marginTop: Spacing.three,
  },
  pickerOption: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  timeControlChip: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8888',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  timeControlChipActive: {
    backgroundColor: '#3c87f733',
  },
  difficultyList: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  friendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  primaryButton: {
    backgroundColor: '#3c87f7',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  secondaryButton: {
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8888',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#e5484d',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  gameActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  confirmCard: {
    borderRadius: Spacing.two,
    gap: Spacing.two,
    padding: Spacing.three,
  },
  challengeCard: {
    borderRadius: Spacing.two,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
  },
  buttonLabel: {
    color: '#fff',
  },
});
