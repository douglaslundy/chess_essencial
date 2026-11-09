'use client';

import type { ClassroomGameView } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import { useEffect, useState } from 'react';

import { ChessBoard } from '@/components/game/chess-board';
import styles from '@/components/portal/portal-pages.module.css';
import { api } from '@/lib/api/client';
import { readClassroomSession } from '@/lib/classroom-session';
import { usePieceTheme } from '@/lib/piece-theme';

const POLL_MS = 1_000;
const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';

/** Read-only view of the game the teacher is playing; follows it once a second. */
export function ClassroomGameWatch({ gameId }: { gameId: string }) {
  const { theme: pieceTheme } = usePieceTheme();
  const [view, setView] = useState<ClassroomGameView | null>(null);
  const [message, setMessage] = useState('Carregando a partida do professor…');

  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    async function tick() {
      const session = readClassroomSession();
      if (!session) {
        setMessage('Você não está em uma aula.');
        return;
      }
      try {
        const next = await api.getClassroomTeacherGame(session.id, gameId, token());
        if (!live) return;
        setView(next);
        if (next.status === 'active') timer = window.setTimeout(() => void tick(), POLL_MS);
      } catch (error) {
        if (!live) return;
        setMessage(error instanceof Error ? error.message : 'Não foi possível ver a partida.');
        timer = window.setTimeout(() => void tick(), POLL_MS * 3);
      }
    }
    void tick();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [gameId]);

  if (!view) {
    return (
      <main className={styles.page}>
        <p className={styles.status} role="status">
          {message}
        </p>
      </main>
    );
  }
  const last = view.moves.at(-1);
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Aula ao vivo</span>
        <h1>
          {view.white} x {view.black}
        </h1>
        <p>
          {view.status === 'active'
            ? `Vez das ${view.sideToMove === 'white' ? 'brancas' : 'pretas'}. Lance ${view.moves.length}.`
            : 'Partida encerrada.'}
        </p>
      </header>
      <section className={styles.card}>
        <ChessBoard
          disabled
          fen={view.fen}
          lastMove={last ? { from: last.from, to: last.to } : undefined}
          onMove={() => undefined}
          orientation="white"
          pieceTheme={pieceTheme}
        />
      </section>
    </main>
  );
}

/**
 * Read-only view of the exercise the teacher is solving: the starting position plus the moves the
 * teacher has played so far (`moves`, UCI). The solution is never sent to the student.
 */
export function ClassroomExerciseWatch({
  exerciseId,
  moves,
}: {
  exerciseId: string;
  moves: string[];
}) {
  const { theme: pieceTheme } = usePieceTheme();
  const [start, setStart] = useState<{ fen: string; prompt: string } | null>(null);
  const [message, setMessage] = useState('Carregando o exercício do professor…');

  useEffect(() => {
    api
      .getExerciseById(exerciseId, token())
      .then((exercise) =>
        exercise.fen
          ? setStart({ fen: exercise.fen, prompt: exercise.promptMd })
          : setMessage('Este exercício não tem tabuleiro.'),
      )
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Não foi possível ver o exercício.'),
      );
  }, [exerciseId]);

  if (!start) {
    return (
      <main className={styles.page}>
        <p className={styles.status} role="status">
          {message}
        </p>
      </main>
    );
  }
  const chess = new Chess(start.fen);
  let last: { from: string; to: string } | undefined;
  for (const uci of moves) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci[4] ? { promotion: uci[4] } : {}),
      });
      last = { from: move.from, to: move.to };
    } catch {
      break;
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Aula ao vivo · exercício</span>
        <h1>Acompanhe o professor</h1>
        <p>{start.prompt}</p>
      </header>
      <section className={styles.card}>
        <ChessBoard
          disabled
          fen={chess.fen()}
          lastMove={last}
          onMove={() => undefined}
          orientation={new Chess(start.fen).turn() === 'w' ? 'white' : 'black'}
          pieceTheme={pieceTheme}
        />
      </section>
    </main>
  );
}
