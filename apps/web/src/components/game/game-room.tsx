'use client';

import type { GameMove, GameState } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ChessBoard, type BoardOrientation } from './chess-board';
import { api } from '@/lib/api/client';
import { GameSocket } from '@/lib/realtime/game-socket';

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function formatClock(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatMove(move: GameMove) {
  const piece = move.san.match(/^[KQRBN]/)?.[0];
  const name =
    ({ K: 'rei', Q: 'dama', R: 'torre', B: 'bispo', N: 'cavalo' } as Record<string, string>)[
      piece ?? ''
    ] ?? 'peão';
  return `${move.san} · ${name} ${move.from}→${move.to}`;
}

function displayedClock(state: GameState, color: BoardOrientation, serverOffset: number) {
  const base = color === 'white' ? state.whiteClockMs : state.blackClockMs;
  if (state.status !== 'active' || state.sideToMove !== color || !state.activeClockStartedAt)
    return base;
  return Math.max(0, base - (Date.now() + serverOffset - Date.parse(state.activeClockStartedAt)));
}

function demoState(gameId: string): GameState {
  return {
    id: gameId,
    status: 'active',
    result: 'none',
    termination: 'none',
    currentFen: initialFen,
    sideToMove: 'white',
    version: 0,
    whiteClockMs: 600000,
    blackClockMs: 600000,
    activeClockStartedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    players: [
      { userId: '00000000-0000-4000-8000-000000000001', color: 'white', ratingBefore: 1524 },
      { userId: '00000000-0000-4000-8000-000000000002', color: 'black', ratingBefore: 1587 },
    ],
  };
}

export function GameRoom({ gameId }: { gameId: string }) {
  const isDemo = gameId === 'demo';
  const [state, setState] = useState<GameState>(() => demoState(gameId));
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [connection, setConnection] = useState<
    'demo' | 'connecting' | 'online' | 'reconnecting' | 'offline'
  >('demo');
  const [message, setMessage] = useState('Entre na sua conta para sincronizar esta partida.');
  const [orientation, setOrientation] = useState<BoardOrientation>('white');
  const [myColor, setMyColor] = useState<BoardOrientation | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [, tick] = useState(0);
  const socketRef = useRef<GameSocket | undefined>(undefined);

  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isDemo) {
      queueMicrotask(() => {
        setConnection('demo');
        setMessage('Demonstração local: mova as peças livremente no tabuleiro.');
      });
      return;
    }
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setConnection('connecting');
    });
    Promise.all([api.getGame(gameId, token), api.getMoves(gameId, token)])
      .then(([nextState, nextMoves]) => {
        if (!active) return;
        setState(nextState);
        setMoves(nextMoves);
        const me = window.localStorage.getItem('xadrez.user_id');
        const player = nextState.players.find((item) => item.userId === me);
        if (player) {
          setOrientation(player.color);
          setMyColor(player.color);
        }
        const socket = new GameSocket(gameId, token, nextState.version, {
          connection: setConnection,
          drawOffered: (_offerId, offeredByUserId, snapshot) => {
            setState(snapshot);
            if (offeredByUserId !== me) {
              setMessage('Seu adversário ofereceu empate. Use Empate para aceitar.');
            }
          },
          snapshot: (snapshot, snapshotMoves, clock) => {
            setState(snapshot);
            setMoves((current) => [
              ...current,
              ...snapshotMoves.filter((move) => !current.some((item) => item.id === move.id)),
            ]);
            setServerOffset(Date.parse(clock.serverNow) - Date.now());
            setMessage('Partida sincronizada. Jogue quando for a sua vez.');
          },
          move: (snapshot, move, clock) => {
            setState(snapshot);
            setMoves((current) =>
              current.some((item) => item.id === move.id) ? current : [...current, move],
            );
            setServerOffset(Date.parse(clock.serverNow) - Date.now());
            setMessage('Lance confirmado pelo servidor.');
          },
          finished: (snapshot, clock) => {
            setState(snapshot);
            setServerOffset(Date.parse(clock.serverNow) - Date.now());
          },
          error: setMessage,
        });
        socketRef.current = socket;
        socket.connect();
      })
      .catch((error: unknown) => {
        setConnection('offline');
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar a partida.');
      });
    return () => {
      active = false;
      socketRef.current?.stop();
    };
  }, [gameId, isDemo]);

  const lastMove = moves.at(-1);
  const white = state.players.find((player) => player.color === 'white');
  const black = state.players.find((player) => player.color === 'black');
  const canMove =
    state.status === 'active' &&
    (isDemo || (connection === 'online' && myColor !== null && state.sideToMove === myColor));
  const groupedMoves = useMemo(() => {
    const rows: Array<{ number: number; white?: GameMove; black?: GameMove }> = [];
    for (const move of moves) {
      const number = Math.ceil(move.ply / 2);
      const row = rows.find((item) => item.number === number) ?? { number };
      if (!rows.includes(row)) rows.push(row);
      if (move.color === 'white') row.white = move;
      else row.black = move;
    }
    return rows;
  }, [moves]);

  async function action(kind: 'draw' | 'resign') {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setMessage('Faça login para usar ações de partida.');
      return;
    }
    try {
      if (kind === 'draw') {
        const result = await api.offerDraw(gameId, token);
        setState(result.state);
        setMessage(
          result.accepted ? 'Empate aceito. A partida foi encerrada.' : 'Oferta de empate enviada.',
        );
      } else {
        if (!window.confirm('Confirmar desistência?')) return;
        setState(await api.resign(gameId, token));
        setMessage('Partida encerrada por desistência.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    }
  }

  function playDemoMove(uci: string) {
    try {
      const chess = new Chess(state.currentFen);
      const fenBefore = chess.fen();
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci[4] ? { promotion: uci[4] } : {}),
      });
      const nextMove: GameMove = {
        clientMoveId: crypto.randomUUID(),
        color: move.color === 'w' ? 'white' : 'black',
        committedAt: new Date().toISOString(),
        fenAfter: chess.fen(),
        fenBefore,
        flags: {
          capture: move.isCapture() || move.isEnPassant(),
          castling: move.isKingsideCastle()
            ? 'king_side'
            : move.isQueensideCastle()
              ? 'queen_side'
              : null,
          enPassant: move.isEnPassant(),
          promotion: move.isPromotion(),
        },
        from: move.from,
        id: moves.length + 1,
        ply: moves.length + 1,
        promotion: move.promotion ?? null,
        san: move.san,
        to: move.to,
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      };
      setMoves((current) => [...current, nextMove]);
      setState((current) => ({
        ...current,
        currentFen: chess.fen(),
        sideToMove: chess.turn() === 'w' ? 'white' : 'black',
        version: current.version + 1,
      }));
      setMessage('Lance aplicado somente nesta demonstração.');
    } catch {
      setMessage('Esse lance não é permitido nesta posição.');
    }
  }

  return (
    <main className="gamePage">
      {connection === 'reconnecting' || connection === 'offline' ? (
        <div className="connectionBanner" role="status">
          <span aria-hidden="true">↻</span>
          {connection === 'reconnecting'
            ? 'Reconectando e recuperando o estado…'
            : 'Conexão interrompida. Seus lances não confirmados não são aplicados.'}
        </div>
      ) : null}
      <section className="gameIdentity" aria-label="Partida">
        <span className="brandMark" aria-hidden="true">
          XE
        </span>
        <div>
          <strong>{isDemo ? 'Tabuleiro demonstrativo' : 'Partida ao vivo'}</strong>
          <span>
            {isDemo
              ? 'Modo local, sem conexão realtime'
              : state.status === 'active'
                ? 'Rápida · 10 min'
                : 'Partida encerrada'}
          </span>
        </div>
        <button
          className="iconButton"
          onClick={() => setOrientation((value) => (value === 'white' ? 'black' : 'white'))}
          title="Girar tabuleiro"
          type="button"
        >
          ↻
        </button>
      </section>

      <aside className="playersColumn">
        <Player
          color="black"
          rating={black?.ratingBefore ?? 0}
          active={state.sideToMove === 'black'}
          clock={displayedClock(state, 'black', serverOffset)}
        />
        {!isDemo ? (
          <div className="gameActions">
            <button onClick={() => action('draw')} type="button">
              ½ Oferecer empate
            </button>
            <button className="dangerAction" onClick={() => action('resign')} type="button">
              ⚑ Desistir
            </button>
          </div>
        ) : null}
        <Player
          color="white"
          rating={white?.ratingBefore ?? 0}
          active={state.sideToMove === 'white'}
          clock={displayedClock(state, 'white', serverOffset)}
        />
      </aside>

      <section className="boardColumn" aria-label="Área do tabuleiro">
        <div className="mobilePlayer">
          <Player
            color={orientation === 'white' ? 'black' : 'white'}
            rating={(orientation === 'white' ? black : white)?.ratingBefore ?? 0}
            active={state.sideToMove !== orientation}
            clock={displayedClock(state, orientation === 'white' ? 'black' : 'white', serverOffset)}
          />
        </div>
        <ChessBoard
          disabled={!canMove}
          fen={state.currentFen}
          lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : undefined}
          movableColor={
            isDemo
              ? state.sideToMove === 'white'
                ? 'w'
                : 'b'
              : myColor === 'white'
                ? 'w'
                : myColor === 'black'
                  ? 'b'
                  : undefined
          }
          onMove={(uci) => {
            if (isDemo) playDemoMove(uci);
            else {
              socketRef.current?.submitMove(uci);
              setMessage('Lance enviado. Aguardando confirmação do servidor…');
            }
          }}
          orientation={orientation}
        />
        <div className="mobilePlayer">
          <Player
            color={orientation}
            rating={(orientation === 'white' ? white : black)?.ratingBefore ?? 0}
            active={state.sideToMove === orientation}
            clock={displayedClock(state, orientation, serverOffset)}
          />
        </div>
        <p className="gameMessage" role="status">
          {message}
        </p>
      </section>

      <aside className="movesPanel">
        <div className="panelTabs" role="tablist" aria-label="Detalhes da partida">
          <button aria-selected="true" role="tab" type="button">
            Lances
          </button>
          <button aria-selected="false" role="tab" type="button">
            Detalhes
          </button>
        </div>
        <div className="moveList" aria-label="Lista de lances">
          {groupedMoves.length ? (
            groupedMoves.map((row) => (
              <div className="moveRow" key={row.number}>
                <span>{row.number}.</span>
                <strong>{row.white ? formatMove(row.white) : ''}</strong>
                <strong>{row.black ? formatMove(row.black) : ''}</strong>
              </div>
            ))
          ) : (
            <div className="emptyMoves">
              <span aria-hidden="true">♟</span>
              <p>Os lances confirmados aparecerão aqui.</p>
            </div>
          )}
        </div>
        <div className="connectionState">
          <span className={connection === 'online' ? 'onlineDot' : 'idleDot'} />
          {connection === 'online'
            ? 'Sincronizado com o servidor'
            : connection === 'demo'
              ? 'Modo de demonstração'
              : connection === 'connecting'
                ? 'Autenticando e entrando na partida…'
                : connection === 'reconnecting'
                  ? 'Reconectando ao servidor…'
                  : 'Partida desconectada'}
        </div>
      </aside>

      {!isDemo ? (
        <div className="mobileActions">
          <button onClick={() => action('draw')} type="button">
            ½ Empate
          </button>
          <button className="dangerAction" onClick={() => action('resign')} type="button">
            ⚑ Desistir
          </button>
        </div>
      ) : null}
    </main>
  );
}

function Player({
  color,
  rating,
  active,
  clock,
}: {
  color: BoardOrientation;
  rating: number;
  active: boolean;
  clock: number;
}) {
  return (
    <article className={`playerCard ${active ? 'activePlayer' : ''}`}>
      <div className="playerAvatar" aria-hidden="true">
        {color === 'white' ? 'B' : 'P'}
      </div>
      <div className="playerMeta">
        <strong>{color === 'white' ? 'Jogador branco' : 'Jogador preto'}</strong>
        <span>{rating} XE</span>
      </div>
      <time className="chessClock">{formatClock(clock)}</time>
    </article>
  );
}
