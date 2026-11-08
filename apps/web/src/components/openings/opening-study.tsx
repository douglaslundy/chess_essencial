'use client';

import type { OpeningDetail } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CoachCallout } from '@/components/coach/coach-callout';
import { ChessBoard } from '@/components/game/chess-board';
import styles from '@/components/portal/portal-pages.module.css';
import { api } from '@/lib/api/client';
import { speakableSquares } from '@/lib/notation';
import { usePieceTheme } from '@/lib/piece-theme';
import { prefetchSpeech, speak, stopSpeaking } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';

const POLL_MS = 3_000;
const REPLY_DELAY_MS = 600;
const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';

interface Step {
  fen: string;
  from: string;
  to: string;
  uci: string;
}

/** FEN after each ply of the line; steps[i] is ply i + 1. */
function buildSteps(moves: string[]): { start: string; steps: Step[] } {
  const chess = new Chess();
  const start = chess.fen();
  const steps: Step[] = [];
  for (const san of moves) {
    const move = chess.move(san);
    steps.push({
      fen: chess.fen(),
      from: move.from,
      to: move.to,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    });
  }
  return { start, steps };
}

export function OpeningStudy({ openingId }: { openingId: string }) {
  const { theme: pieceTheme } = usePieceTheme();
  const { voiceName } = useVoicePreference();
  const [detail, setDetail] = useState<OpeningDetail | null>(null);
  const [message, setMessage] = useState('Carregando a abertura…');
  const [mode, setMode] = useState<'practice' | 'study'>('study');
  const [ply, setPly] = useState(0);
  const [wrongOnce, setWrongOnce] = useState(false);
  const [practiceNote, setPracticeNote] = useState('');
  const savedRef = useRef(false);

  const refresh = useCallback(
    () =>
      api
        .getOpening(openingId, token())
        .then(setDetail)
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar a abertura.'),
        ),
    [openingId],
  );

  useEffect(() => {
    void refresh();
    if (new URLSearchParams(window.location.search).get('modo') === 'treino') {
      queueMicrotask(() => setMode('practice'));
    }
  }, [refresh]);

  // The lesson is written once by the AI and stored: opening the line asks for it, and the page
  // follows the generation until it is complete.
  const lessonStatus = detail?.lesson.status;
  const wantsLesson = detail !== null && detail.aiAvailable && lessonStatus !== 'completed';
  useEffect(() => {
    if (!wantsLesson) return;
    let live = true;
    let timer: number | undefined;
    async function tick() {
      try {
        const next = await api.requestOpeningLesson(openingId, token());
        if (!live) return;
        setDetail(next);
        if (next.lesson.status === 'generating')
          timer = window.setTimeout(() => void tick(), POLL_MS);
      } catch (error) {
        if (live) setMessage(error instanceof Error ? error.message : 'Falha ao gerar a aula.');
      }
    }
    void tick();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [wantsLesson, openingId]);

  const line = detail?.line ?? null;
  const built = useMemo(() => (line ? buildSteps(line.moves) : null), [line]);
  const total = built?.steps.length ?? 0;
  const fen = ply === 0 ? (built?.start ?? '') : (built?.steps[ply - 1]?.fen ?? '');
  const frame = detail?.lesson.frames.find((item) => item.index === ply) ?? null;

  // Stored voices: the first student triggers generation, the next ones play the saved audio.
  const frameTexts = detail?.lesson.status === 'completed' ? detail.lesson.frames : null;
  useEffect(() => {
    if (!frameTexts || !detail) return;
    prefetchSpeech(
      [detail.lesson.overview, ...frameTexts.map((item) => item.text)].map(speakableSquares),
      voiceName,
    );
  }, [frameTexts, detail, voiceName]);

  const studyText = ply === 0 ? (detail?.lesson.overview ?? '') : (frame?.text ?? '');
  useEffect(() => {
    if (mode !== 'study' || !studyText) return;
    speak(speakableSquares(studyText), { interrupt: true, voiceName }).catch(() => undefined);
    return () => stopSpeaking();
  }, [mode, studyText, voiceName]);

  // Practice: the student plays their side from memory; the other side answers by itself.
  const side = line?.side ?? 'white';
  const myTurn = side === 'white' ? ply % 2 === 0 : ply % 2 === 1;
  useEffect(() => {
    if (mode !== 'practice' || !built || ply >= total || myTurn) return;
    const timer = setTimeout(() => setPly((value) => value + 1), REPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, built, ply, total, myTurn]);

  const finished = mode === 'practice' && total > 0 && ply >= total;
  useEffect(() => {
    if (!finished || savedRef.current) return;
    savedRef.current = true;
    api
      .practiceOpening(openingId, !wrongOnce, token())
      .then((result) =>
        setPracticeNote(
          `${wrongOnce ? 'Vamos repetir logo.' : 'Linha completa!'} Próxima revisão: ${new Date(result.dueAt).toLocaleString('pt-BR')}.`,
        ),
      )
      .catch(() => undefined);
  }, [finished, openingId, wrongOnce]);

  function onMove(uci: string) {
    if (mode !== 'practice' || !built || !myTurn || ply >= total) return;
    if (built.steps[ply]!.uci === uci) {
      setPly(ply + 1);
      setPracticeNote('');
      return;
    }
    setWrongOnce(true);
    const expected = built.steps[ply]!;
    setPracticeNote(`Não é esse. No livro, o lance é ${expected.from} para ${expected.to}.`);
    if (!savedRef.current) {
      savedRef.current = true;
      void api.practiceOpening(openingId, false, token()).catch(() => undefined);
    }
  }

  function restart(next: 'practice' | 'study') {
    stopSpeaking();
    savedRef.current = false;
    setWrongOnce(false);
    setPracticeNote('');
    setMode(next);
    setPly(0);
  }

  if (!detail || !line || !built) {
    return (
      <main className={styles.page}>
        <p className={styles.status} role="status">
          {message}
        </p>
      </main>
    );
  }

  const last = built.steps[ply - 1];
  const coachMessage =
    mode === 'practice'
      ? finished
        ? practiceNote || 'Linha completa!'
        : practiceNote ||
          (myTurn
            ? 'Sua vez: jogue o próximo lance da abertura.'
            : 'Aguarde a resposta do adversário…')
      : studyText ||
        (detail.lesson.status === 'generating'
          ? 'A IA está escrevendo a aula desta abertura; ela aparece aqui e fica guardada para os próximos alunos.'
          : detail.aiAvailable
            ? 'Use as setas para ver cada lance.'
            : 'A IA não está ativada na plataforma, por isso esta aula ainda não tem explicações.');

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>
          {line.eco} · estudando de {side === 'white' ? 'brancas' : 'pretas'}
        </span>
        <h1>{line.name}</h1>
        <p>{line.pgn}</p>
      </header>

      <section className={styles.card}>
        <CoachCallout message={coachMessage} />
        <ChessBoard
          disabled={mode === 'study' || !myTurn || finished}
          fen={fen}
          lastMove={last ? { from: last.from, to: last.to } : undefined}
          movableColor={mode === 'practice' && myTurn ? (side === 'white' ? 'w' : 'b') : undefined}
          onMove={onMove}
          orientation={side}
          pieceTheme={pieceTheme}
        />
        <div role="group" aria-label="Comandos do estudo">
          {mode === 'study' ? (
            <>
              <button disabled={ply === 0} onClick={() => setPly(0)} type="button">
                ⏮
              </button>
              <button disabled={ply === 0} onClick={() => setPly(ply - 1)} type="button">
                ◀
              </button>
              <span>
                {' '}
                Lance {ply}/{total}{' '}
              </span>
              <button disabled={ply >= total} onClick={() => setPly(ply + 1)} type="button">
                ▶
              </button>
              <button disabled={ply >= total} onClick={() => setPly(total)} type="button">
                ⏭
              </button>{' '}
              <button
                className={styles.primaryButton}
                onClick={() => restart('practice')}
                type="button"
              >
                Treinar de memória
              </button>
            </>
          ) : (
            <button className={styles.primaryButton} onClick={() => restart('study')} type="button">
              Voltar ao estudo
            </button>
          )}
          {finished ? (
            <button onClick={() => restart('practice')} type="button">
              Treinar de novo
            </button>
          ) : null}
        </div>
        {detail.dueAt ? (
          <p className={styles.helpText}>
            Próxima revisão: {new Date(detail.dueAt).toLocaleString('pt-BR')}
          </p>
        ) : null}
      </section>
      <Link className={styles.helpText} href="/app/aberturas">
        ← Todas as aberturas
      </Link>
    </main>
  );
}
