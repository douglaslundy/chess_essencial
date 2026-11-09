'use client';

import { classifyMove } from '@xadrez/chess-domain';
import type { OpeningBranch, OpeningDetail } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CoachCallout } from '@/components/coach/coach-callout';
import { ChessBoard, type PieceTheme } from '@/components/game/chess-board';
import { explainMove } from '@/components/history/move-narration';
import styles from '@/components/portal/portal-pages.module.css';
import { api } from '@/lib/api/client';
import { evaluatePosition } from '@/lib/engine/browser-engine';
import { speakableSquares, toBrazilianSan } from '@/lib/notation';
import { speak, stopSpeaking } from '@/lib/speech';

const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';
const BOT_DELAY_MS = 700;
/** Chance that the bot follows the studied line while it can; otherwise it picks another book move. */
const FOLLOW_LINE_RATE = 0.65;
const ENGINE_DEPTH = 10;

const toUci = (move: { from: string; promotion?: string | undefined; to: string }) =>
  `${move.from}${move.to}${move.promotion ?? ''}`;

function applyUci(chess: Chess, uci: string) {
  return chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  });
}

function sanOf(fen: string, uci: string): string {
  try {
    return toBrazilianSan(applyUci(new Chess(fen), uci).san);
  } catch {
    return uci;
  }
}

/**
 * A game against the bot that follows the opening book: the bot plays the studied line (or, at
 * times, another book move, so the student practises adapting). When either side leaves the book
 * the screen says so, names what the book has, and the engine grades and explains the move.
 */
export function OpeningPlay({
  detail,
  pieceTheme,
  voiceName,
}: {
  detail: OpeningDetail;
  pieceTheme: PieceTheme;
  voiceName: string | null;
}) {
  const { line } = detail;
  const side = line.side;
  const mine = side === 'white' ? 'w' : 'b';
  const [fen, setFen] = useState(() => new Chess().fen());
  const [played, setPlayed] = useState<string[]>([]);
  const [inBook, setInBook] = useState(true);
  const [notes, setNotes] = useState<string[]>([
    'Você joga a abertura de memória. O bot segue o livro, mas às vezes escolhe outra variante: aí você precisa se adaptar.',
  ]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const generation = useRef(0);

  const say = useCallback(
    (text: string) => {
      setNotes((current) => [...current.slice(-4), text]);
      speak(speakableSquares(text), { interrupt: true, voiceName }).catch(() => undefined);
    },
    [voiceName],
  );

  // What the book knows about the other lines at a deviation: the stored lesson text of the move.
  const explainBookMove = useCallback(async (branch: OpeningBranch, ply: number) => {
    try {
      let other = await api.getOpening(branch.openingId, token());
      if (other.lesson.status !== 'completed' && other.aiAvailable) {
        other = await api.requestOpeningLesson(branch.openingId, token());
      }
      return other.lesson.frames.find((frame) => frame.index === ply)?.text ?? null;
    } catch {
      return null;
    }
  }, []);

  const gradeWithEngine = useCallback(async (fenBefore: string, uci: string) => {
    const after = new Chess(fenBefore);
    const move = applyUci(after, uci);
    const before = await evaluatePosition(fenBefore, { depth: ENGINE_DEPTH });
    const next = await evaluatePosition(after.fen(), { depth: ENGINE_DEPTH });
    const quality = classifyMove({
      mateAfter: next.mate === null ? null : -next.mate,
      mateBefore: before.mate,
      scoreAfterCp: next.scoreCp === null ? null : -next.scoreCp,
      scoreBeforeCp: before.scoreCp,
    });
    return {
      bestMoveUci: before.bestMove,
      text: explainMove(
        { fenBefore, san: move.san, uci },
        {
          bestMoveUci: before.bestMove,
          centipawnLoss: quality.centipawnLoss,
          quality: quality.quality,
        },
        'text',
      ),
    };
  }, []);

  const botMove = useCallback(
    async (chess: Chess, history: string[], stillInBook: boolean) => {
      const run = generation.current;
      setBusy(true);
      const fenBefore = chess.fen();
      let uci: string | null = null;
      let branch: OpeningBranch | null = null;
      let book = stillInBook;
      if (stillInBook) {
        const branches = await api.listOpeningBranches(history.join(' '), token()).catch(() => []);
        const ply = history.length;
        const studied = line.moves[ply] ? sanToUci(chess, line.moves[ply]!) : null;
        const onLine = branches.find((item) => item.uci === studied) ?? null;
        if (branches.length === 0) book = false;
        else if (onLine && Math.random() < FOLLOW_LINE_RATE) branch = onLine;
        else branch = branches[Math.floor(Math.random() * branches.length)]!;
        uci = branch?.uci ?? null;
      }
      if (!uci) {
        uci = (await evaluatePosition(fenBefore, { depth: ENGINE_DEPTH })).bestMove;
        if (stillInBook && !book) {
          say('O livro termina aqui. A partir de agora o bot joga pelo motor: use o que aprendeu.');
        }
      }
      if (run !== generation.current || !uci) return;
      const move = applyUci(chess, uci);
      const next = [...history, uci];
      setFen(chess.fen());
      setPlayed(next);
      setLastMove({ from: move.from, to: move.to });
      setInBook(book);
      setBusy(false);
      if (chess.isGameOver()) setOver(true);
      if (branch && !isOnStudiedLine(line.moves, next)) {
        const ply = next.length;
        const text = await explainBookMove(branch, ply);
        say(
          `O bot jogou ${toBrazilianSan(move.san)}, da linha ${branch.name}, fora da sua. ${text ?? 'Estude essa variante para saber responder.'} ` +
            `Para estudar esta variante, abra "${branch.name}" na lista de aberturas.`,
        );
      }
    },
    [explainBookMove, line.moves, say],
  );

  // The bot opens when the student studies the black side.
  useEffect(() => {
    if (side !== 'black') return;
    const timer = setTimeout(() => void botMove(new Chess(), [], true), BOT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      generation.current += 1;
      stopSpeaking();
    },
    [],
  );

  async function onMove(uci: string) {
    if (busy || over) return;
    const chess = new Chess(fen);
    if (chess.turn() !== mine) return;
    const fenBefore = chess.fen();
    let move;
    try {
      move = applyUci(chess, uci);
    } catch {
      return;
    }
    const history = [...played, uci];
    setFen(chess.fen());
    setPlayed(history);
    setLastMove({ from: move.from, to: move.to });

    let book = inBook;
    if (inBook) {
      const options = await api.listOpeningBranches(played.join(' '), token()).catch(() => []);
      const hit = options.find((item) => item.uci === uci);
      if (!hit) {
        book = false;
        setInBook(false);
        const names = options
          .slice(0, 3)
          .map((item) => `${sanOf(fenBefore, item.uci)} (${item.name})`)
          .join('; ');
        const graded = await gradeWithEngine(fenBefore, uci).catch(() => null);
        const best = graded?.bestMoveUci ? sanOf(fenBefore, graded.bestMoveUci) : null;
        say(
          `Você saiu do livro com ${toBrazilianSan(move.san)}. ${names ? `Nesta posição o livro joga: ${names}. ` : ''}` +
            `${graded?.text ?? ''}${best ? ` Para se adaptar, o motor prefere ${best}.` : ''}`,
        );
      } else if (!isOnStudiedLine(line.moves, history)) {
        say(`Você seguiu outra linha do livro: ${hit.name}. Também é jogada de livro.`);
      }
    }
    if (chess.isGameOver()) {
      setOver(true);
      say('Fim de jogo.');
      return;
    }
    setTimeout(() => void botMove(chess, history, book), BOT_DELAY_MS);
  }

  function restart() {
    generation.current += 1;
    stopSpeaking();
    setFen(new Chess().fen());
    setPlayed([]);
    setInBook(true);
    setOver(false);
    setBusy(false);
    setLastMove(undefined);
    setNotes(['Nova partida. Boa sorte!']);
    if (side === 'black') setTimeout(() => void botMove(new Chess(), [], true), BOT_DELAY_MS);
  }

  const turnIsMine = new Chess(fen).turn() === mine;
  return (
    <>
      <CoachCallout message={notes.at(-1)!} />
      <ChessBoard
        disabled={busy || over || !turnIsMine}
        fen={fen}
        lastMove={lastMove}
        movableColor={turnIsMine && !over ? mine : undefined}
        onMove={(uci) => void onMove(uci)}
        orientation={side}
        pieceTheme={pieceTheme}
      />
      <p className={styles.helpText}>
        {inBook ? 'Dentro do livro.' : 'Fora do livro.'} Lance {played.length}.
      </p>
      <button className={styles.primaryButton} onClick={restart} type="button">
        Nova partida
      </button>{' '}
      <Link className={styles.helpText} href="/app/aberturas">
        Ver outras aberturas
      </Link>
    </>
  );
}

function sanToUci(chess: Chess, san: string): string | null {
  try {
    return toUci(new Chess(chess.fen()).move(san));
  } catch {
    return null;
  }
}

/** True while every move played so far is the studied line's. */
export function isOnStudiedLine(studied: string[], playedUci: string[]): boolean {
  const chess = new Chess();
  for (const [i, uci] of playedUci.entries()) {
    const expected = studied[i];
    if (!expected) return false;
    try {
      if (toUci(chess.move(expected)) !== uci) return false;
    } catch {
      return false;
    }
  }
  return true;
}
