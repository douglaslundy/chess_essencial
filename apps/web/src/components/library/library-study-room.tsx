'use client';

import type { LibraryGame, LibraryReview, LibraryReviewEntry } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import styles from './library.module.css';
import { ChessBoard, type BoardOrientation } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';
import { speakableSquares, toBrazilianSan } from '@/lib/notation';
import { usePieceTheme } from '@/lib/piece-theme';
import { speak, stopSpeaking } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';

const POLL_MS = 4000;
const AUTOPLAY_MS = 3500;
const RESULT_LABEL: Record<string, string> = {
  '1-0': 'Vitória das brancas',
  '0-1': 'Vitória das pretas',
  '1/2-1/2': 'Empate',
};

interface Frame {
  fen: string;
  from: string;
  san: string;
  to: string;
}

function buildFrames(movesSan: string[]): { frames: Frame[]; startFen: string } {
  const chess = new Chess();
  const startFen = chess.fen();
  const frames: Frame[] = [];
  for (const san of movesSan) {
    const move = chess.move(san);
    frames.push({ fen: chess.fen(), from: move.from, san: move.san, to: move.to });
  }
  return { frames, startFen };
}

function speechFor(entry: LibraryReviewEntry) {
  return speakableSquares(entry.summary);
}

export function LibraryStudyRoom({ gameId }: { gameId: string }) {
  const { theme: pieceTheme } = usePieceTheme();
  const { voiceName } = useVoicePreference();
  const [game, setGame] = useState<LibraryGame | null>(null);
  const [review, setReview] = useState<LibraryReview | null>(null);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<BoardOrientation>('white');
  const [audio, setAudio] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('Carregando partida…');
  const [requesting, setRequesting] = useState(false);
  const [audioNotice, setAudioNotice] = useState('');
  const [autoRequested, setAutoRequested] = useState(false);

  const token = () => window.localStorage.getItem('xadrez.access_token');

  useEffect(() => {
    const accessToken = token();
    if (!accessToken) {
      queueMicrotask(() => setMessage('Entre na sua conta para estudar partidas.'));
      return;
    }
    Promise.all([
      api.getLibraryGame(gameId, accessToken),
      api.getLibraryReview(gameId, accessToken),
    ])
      .then(([nextGame, nextReview]) => {
        setGame(nextGame);
        setReview(nextReview);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar a partida.'),
      );
  }, [gameId]);

  const generating = review?.status === 'generating';
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => {
      const accessToken = token();
      if (!accessToken) return;
      api
        .getLibraryReview(gameId, accessToken)
        .then(setReview)
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [generating, gameId]);

  const built = useMemo(() => {
    if (!game) return null;
    try {
      return buildFrames(game.movesSan);
    } catch {
      return null;
    }
  }, [game]);

  const total = built?.frames.length ?? 0;
  const frame = ply > 0 ? built?.frames[ply - 1] : undefined;
  const entry = review?.entries.find((candidate) => candidate.ply === ply) ?? null;
  const fen =
    frame?.fen ?? built?.startFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const mover = ply % 2 === 1 ? 'Brancas' : 'Pretas';
  const fallbackSpeech = `${mover} jogam ${speakableSquares(toBrazilianSan(frame?.san ?? ''))}.`;
  // A string (not the entry object) so review polling does not restart the narration.
  const narration = entry ? speechFor(entry) : fallbackSpeech;
  const go = useCallback((next: number) => setPly(Math.min(Math.max(next, 0), total)), [total]);

  // Narration: speaks the stored summary whenever the move changes (or audio is turned on).
  useEffect(() => {
    if (!audio || ply === 0) return;
    // The AI voice can fail (no key, quota, autoplay block); the browser voice keeps the narration going.
    speak(narration, { interrupt: true, voiceName }).catch(() => {
      setAudioNotice('A voz por IA falhou; usando a voz do navegador.');
      void speak(narration, { interrupt: true }).catch(() => undefined);
    });
  }, [audio, narration, ply, voiceName]);

  useEffect(() => {
    if (!audio) stopSpeaking();
    return () => stopSpeaking();
  }, [audio]);

  // Auto-play: advances after the narration ends (or after a fixed pause without audio).
  useEffect(() => {
    if (!playing) return;
    if (ply >= total) {
      queueMicrotask(() => setPlaying(false));
      return;
    }
    let cancelled = false;
    const advance = () => {
      if (!cancelled) setPly((current) => Math.min(current + 1, total));
    };
    const timer = setTimeout(advance, AUTOPLAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [playing, ply, total]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'ArrowRight') go(ply + 1);
      if (event.key === 'ArrowLeft') go(ply - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, ply]);

  const wantsReview =
    review !== null &&
    review.aiAvailable &&
    (review.status === 'none' || review.status === 'failed');
  // The review is generated once and stored; opening a game without one starts it right away.
  useEffect(() => {
    if (!wantsReview || autoRequested) return;
    const accessToken = token();
    if (!accessToken) return;
    queueMicrotask(() => setAutoRequested(true));
    api
      .requestLibraryReview(gameId, accessToken)
      .then(setReview)
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao solicitar a revisão.'),
      );
  }, [wantsReview, autoRequested, gameId]);

  async function requestReview() {
    const accessToken = token();
    if (!accessToken) return;
    setRequesting(true);
    try {
      setReview(await api.requestLibraryReview(gameId, accessToken));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao solicitar a revisão.');
    } finally {
      setRequesting(false);
    }
  }

  if (!game || !built) {
    return (
      <main className={styles.page}>
        <p className={styles.status} role="status">
          {message || 'Não foi possível montar esta partida.'}
        </p>
        <Link className={styles.button} href="/app/biblioteca">
          Voltar à biblioteca
        </Link>
      </main>
    );
  }

  const canRequest = wantsReview && autoRequested;

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>{game.event ?? 'Partida de estudo'}</span>
        <h1>
          {game.white} × {game.black}
        </h1>
        <p>
          {RESULT_LABEL[game.result]}
          {game.playedOn ? ` · ${game.playedOn}` : ''}
          {game.openingName ? ` · ${game.openingName}` : ''}
        </p>
      </header>

      <section aria-label="Revisão da partida" className={styles.stage}>
        <div className={styles.bubbleSlot}>
          <div aria-live="polite" className={styles.bubble} role="status">
            {ply === 0 ? (
              <>
                <h2>Início da partida</h2>
                <p>
                  {game.white} (brancas) contra {game.black} (pretas). Use as setas para avançar
                  lance a lance.
                </p>
              </>
            ) : (
              <>
                <h2>
                  Lance {Math.ceil(ply / 2)} · {mover} · {toBrazilianSan(frame?.san ?? '')}
                </h2>
                {entry ? (
                  <ul>
                    <li>
                      <b>Por quê:</b> {entry.why}
                    </li>
                    {entry.strength ? (
                      <li className={styles.good}>
                        <b>Forte:</b> {entry.strength}
                      </li>
                    ) : null}
                    {entry.weakness ? (
                      <li className={styles.warn}>
                        <b>Fraco:</b> {entry.weakness}
                      </li>
                    ) : null}
                    {entry.better ? (
                      <li>
                        <b>Melhor: {toBrazilianSan(entry.better)}</b> {entry.betterWhy}
                      </li>
                    ) : null}
                    {entry.expect ? (
                      <li>
                        <b>Espera-se:</b> {entry.expect}
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p>
                    {generating || requesting || wantsReview
                      ? 'A IA está preparando a revisão desta partida. Os comentários aparecem aqui assim que ficarem prontos.'
                      : review && !review.aiAvailable
                        ? 'A IA não está ativada na plataforma, por isso esta partida ainda não tem comentários.'
                        : 'Sem comentário para este lance.'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className={styles.boardSlot}>
          <ChessBoard
            disabled
            fen={fen}
            lastMove={frame ? { from: frame.from, to: frame.to } : undefined}
            onMove={() => undefined}
            orientation={orientation}
            pieceTheme={pieceTheme}
          />
        </div>

        <div aria-label="Controles" className={styles.controls} role="group">
          <button aria-label="Início" className={styles.button} onClick={() => go(0)} type="button">
            ⏮
          </button>
          <button
            aria-label="Lance anterior"
            className={styles.button}
            disabled={ply === 0}
            onClick={() => go(ply - 1)}
            type="button"
          >
            ◀
          </button>
          <button
            aria-pressed={playing}
            className={`${styles.button} ${styles.primary}`}
            onClick={() => {
              if (ply >= total) setPly(0);
              setPlaying((value) => !value);
            }}
            type="button"
          >
            {playing ? 'Pausar' : 'Reproduzir'}
          </button>
          <button
            aria-label="Próximo lance"
            className={styles.button}
            disabled={ply >= total}
            onClick={() => go(ply + 1)}
            type="button"
          >
            ▶
          </button>
          <button
            aria-label="Fim"
            className={styles.button}
            onClick={() => go(total)}
            type="button"
          >
            ⏭
          </button>
          <button
            aria-pressed={audio}
            className={styles.button}
            onClick={() => setAudio((value) => !value)}
            type="button"
          >
            {audio ? 'Áudio ligado' : 'Áudio desligado'}
          </button>
          <button
            className={styles.button}
            onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
            type="button"
          >
            Girar
          </button>
        </div>
      </section>

      {review && review.status === 'none' && !review.aiAvailable ? (
        <p className={styles.notice}>
          A revisão comentada ainda não foi gerada e a IA não está ativada na plataforma.
        </p>
      ) : null}
      {canRequest ? (
        <div className={styles.notice}>
          <p>
            {review?.status === 'failed'
              ? 'A geração anterior foi interrompida; ela continua de onde parou.'
              : 'Esta partida ainda não tem revisão. Ela será gerada uma única vez pela IA e ficará salva para todos.'}
          </p>
          <button
            className={`${styles.button} ${styles.primary}`}
            disabled={requesting}
            onClick={() => void requestReview()}
            type="button"
          >
            {requesting ? 'Solicitando…' : 'Gerar revisão com IA'}
          </button>
        </div>
      ) : null}
      {generating ? (
        <p className={styles.notice} role="status">
          Gerando revisão: {review?.entries.length ?? 0} de {total} lances comentados…
        </p>
      ) : null}
      {message ? <p className={styles.status}>{message}</p> : null}
      {audio && audioNotice ? (
        <p className={styles.status} role="status">
          {audioNotice}
        </p>
      ) : null}

      <nav aria-label="Lances" className={styles.moveList}>
        {built.frames.map((item, index) => (
          <button
            aria-current={ply === index + 1}
            key={`${index}-${item.san}`}
            onClick={() => go(index + 1)}
            type="button"
          >
            {index % 2 === 0 ? `${index / 2 + 1}. ` : ''}
            {toBrazilianSan(item.san)}
          </button>
        ))}
      </nav>
      <Link className={styles.button} href="/app/biblioteca">
        Voltar à biblioteca
      </Link>
    </main>
  );
}
