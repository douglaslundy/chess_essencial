'use client';

import type { LibraryGame, LibraryReview, LibraryReviewEntry } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { finalVerdict } from './final-verdict';
import { formatPlayedOn } from './format-date';
import styles from './library.module.css';
import { markGameWatched } from './watched-games';
import { CoachCallout } from '@/components/coach/coach-callout';
import { ChessBoard, type BoardOrientation } from '@/components/game/chess-board';
import { ReplayPlayer } from '@/components/game/replay-player';
import { api } from '@/lib/api/client';
import { speakableSquares, toBrazilianSan } from '@/lib/notation';
import { usePieceTheme } from '@/lib/piece-theme';
import { speak, stopSpeaking } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';

const POLL_MS = 4000;
const AUTOPLAY_MS = 3500;
const AUTOPLAY_AFTER_SPEECH_MS = 1000;
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

function buildFrames(movesSan: string[]): { final: Chess; frames: Frame[]; startFen: string } {
  const chess = new Chess();
  const startFen = chess.fen();
  const frames: Frame[] = [];
  for (const san of movesSan) {
    const move = chess.move(san);
    frames.push({ fen: chess.fen(), from: move.from, san: move.san, to: move.to });
  }
  return { final: chess, frames, startFen };
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
  // Ply whose narration finished: auto-play waits for it before the next move.
  const [spokenPly, setSpokenPly] = useState(-1);
  const [autoRequested, setAutoRequested] = useState(false);
  const [verdictClosed, setVerdictClosed] = useState(false);

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

  const verdict = useMemo(
    () => (built && game ? finalVerdict(game.result, built.final) : null),
    [built, game],
  );
  const atEnd = total > 0 && ply === total;

  const mover = ply % 2 === 1 ? 'Brancas' : 'Pretas';
  const fallbackSpeech = `${mover} jogam ${speakableSquares(toBrazilianSan(frame?.san ?? ''))}.`;
  // A string (not the entry object) so review polling does not restart the narration.
  const moveNarration = entry ? speechFor(entry) : fallbackSpeech;
  const narration = atEnd && verdict ? `${moveNarration} ${verdict.detail}` : moveNarration;
  const go = useCallback(
    (next: number) => {
      setVerdictClosed(false);
      setPly(Math.min(Math.max(next, 0), total));
    },
    [total],
  );

  // Advancing the first move counts as watching: the library list marks the game.
  const started = ply > 0;
  useEffect(() => {
    if (started) markGameWatched(gameId);
  }, [started, gameId]);

  // Narration: speaks the stored summary whenever the move changes (or audio is turned on).
  useEffect(() => {
    if (!audio || ply === 0) return;
    let live = true;
    const onEnd = () => live && setSpokenPly(ply);
    // shortcut: a voice that never reports its end would stop auto-play, so a cap moves on.
    const cap = setTimeout(onEnd, narration.length * 200 + 10_000);
    // The AI voice can fail (no key, quota, autoplay block); the browser voice keeps the narration going.
    speak(narration, { interrupt: true, onEnd, voiceName }).catch(() => {
      setAudioNotice('A voz por IA falhou; usando a voz do navegador.');
      void speak(narration, { interrupt: true, onEnd }).catch(() => undefined);
    });
    return () => {
      live = false;
      clearTimeout(cap);
    };
  }, [audio, narration, ply, voiceName]);

  useEffect(() => {
    if (!audio) stopSpeaking();
    return () => stopSpeaking();
  }, [audio]);

  // Auto-play: advances after the narration ends (or after a fixed pause without audio).
  const narrationDone = !audio || ply === 0 || spokenPly === ply;
  useEffect(() => {
    if (!playing) return;
    if (ply >= total) {
      queueMicrotask(() => setPlaying(false));
      return;
    }
    if (!narrationDone) return;
    let cancelled = false;
    const advance = () => {
      if (!cancelled) setPly((current) => Math.min(current + 1, total));
    };
    const timer = setTimeout(advance, audio && ply > 0 ? AUTOPLAY_AFTER_SPEECH_MS : AUTOPLAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audio, narrationDone, playing, ply, total]);

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
  const rowCount = Math.ceil(built.frames.length / 2);
  const moveSan = toBrazilianSan(frame?.san ?? '');
  const coachLabel = ply === 0 ? 'Início' : `Lance ${Math.ceil(ply / 2)} · ${mover} · ${moveSan}`;
  const coachMessage =
    ply === 0
      ? `${game.white} (brancas) contra ${game.black} (pretas). Use as setas para avançar lance a lance.`
      : entry
        ? [
            entry.summary,
            entry.why,
            entry.better ? `Melhor seria ${toBrazilianSan(entry.better)}: ${entry.betterWhy}` : '',
            entry.expect ?? '',
          ]
            .filter(Boolean)
            .join(' ')
        : generating || requesting || wantsReview
          ? 'A IA está preparando a revisão desta partida; os comentários aparecem aqui assim que ficarem prontos.'
          : review && !review.aiAvailable
            ? 'A IA não está ativada na plataforma, por isso esta partida ainda não tem comentários.'
            : `${mover} jogam ${moveSan}.`;
  const topColor = orientation === 'white' ? 'black' : 'white';
  const sideToMove = ply % 2 === 0 ? 'white' : 'black';
  const playerCard = (color: 'white' | 'black') => (
    <ReplayPlayer
      active={ply > 0 && sideToMove === color}
      label={color === 'white' ? 'Brancas' : 'Pretas'}
      name={color === 'white' ? game.white : game.black}
    />
  );

  // Same skeleton as the game page (gamePage/boardStage/historyControls/movesPanel), so the
  // study room inherits its board size, compact controls and in-frame panels.
  return (
    <main className="gamePage">
      <aside className="playersColumn">
        {playerCard(topColor)}
        <div className="libraryGameInfo">
          <strong>{game.event ?? 'Partida de estudo'}</strong>
          <span>
            {RESULT_LABEL[game.result]}
            {game.playedOn ? ` · ${formatPlayedOn(game.playedOn)}` : ''}
          </span>
          {game.openingName ? <span>{game.openingName}</span> : null}
          <Link href="/app/biblioteca">← Biblioteca</Link>
        </div>
        {playerCard(orientation)}
      </aside>

      <section className="boardColumn" aria-label="Área do tabuleiro">
        <CoachCallout label={coachLabel} message={coachMessage} />
        <div className="mobilePlayer">{playerCard(topColor)}</div>
        <div className="boardStage">
          <ChessBoard
            disabled
            fen={fen}
            lastMove={frame ? { from: frame.from, to: frame.to } : undefined}
            onMove={() => undefined}
            orientation={orientation}
            pieceTheme={pieceTheme}
          />
          <div aria-label="Comandos do tabuleiro" className="historyControls" role="group">
            <button aria-label="Início" disabled={ply === 0} onClick={() => go(0)} type="button">
              ⏮
            </button>
            <button
              aria-label="Lance anterior"
              disabled={ply === 0}
              onClick={() => go(ply - 1)}
              type="button"
            >
              ◀
            </button>
            <button
              aria-label={playing ? 'Pausar' : 'Reproduzir'}
              aria-pressed={playing}
              onClick={() => {
                if (ply >= total) go(0);
                setPlaying((value) => !value);
              }}
              title={playing ? 'Pausar' : 'Reproduzir'}
              type="button"
            >
              {playing ? '⏸' : '⏵'}
            </button>
            <button
              aria-label="Próximo lance"
              disabled={ply >= total}
              onClick={() => go(ply + 1)}
              type="button"
            >
              ▶
            </button>
            <button
              aria-label="Fim"
              disabled={ply >= total}
              onClick={() => go(total)}
              type="button"
            >
              ⏭
            </button>
            <button
              aria-label={audio ? 'Desligar áudio' : 'Ligar áudio'}
              aria-pressed={audio}
              onClick={() => setAudio((value) => !value)}
              title={audio ? 'Áudio ligado' : 'Áudio desligado'}
              type="button"
            >
              {audio ? '🔊' : '🔇'}
            </button>
            <button
              aria-label="Girar tabuleiro"
              onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              title="Girar tabuleiro"
              type="button"
            >
              ↻
            </button>
          </div>
        </div>
        <div className="mobilePlayer">{playerCard(orientation)}</div>
        {message || (audio && audioNotice) ? (
          <p className="gameMessage" role="status">
            {message || audioNotice}
          </p>
        ) : null}
      </section>

      <aside className="movesPanel">
        <div className="panelTabs" role="tablist" aria-label="Partida">
          <button aria-selected="true" role="tab" type="button">
            Lances
          </button>
        </div>
        <div className="moveList" aria-label="Lista de lances">
          {Array.from({ length: rowCount }, (_, index) => (
            <div className="moveRow" key={index}>
              <span>{index + 1}.</span>
              {[index * 2 + 1, index * 2 + 2].map((movePly) => {
                const item = built.frames[movePly - 1];
                return item ? (
                  <button
                    aria-current={ply === movePly}
                    className="moveLink"
                    key={movePly}
                    onClick={() => go(movePly)}
                    type="button"
                  >
                    {toBrazilianSan(item.san)}
                  </button>
                ) : (
                  <strong key={movePly} />
                );
              })}
            </div>
          ))}
        </div>
        <div className="connectionState">
          {generating ? (
            `Gerando revisão: ${review?.entries.length ?? 0} de ${total} lances…`
          ) : canRequest ? (
            <button
              className="libraryReviewButton"
              disabled={requesting}
              onClick={() => void requestReview()}
              type="button"
            >
              {requesting ? 'Solicitando…' : 'Gerar revisão com IA'}
            </button>
          ) : review && review.status === 'none' && !review.aiAvailable ? (
            'Revisão comentada indisponível: IA não ativada.'
          ) : (
            `${RESULT_LABEL[game.result]} · ${total} lances`
          )}
        </div>
      </aside>

      {atEnd && verdict && !verdictClosed ? (
        <div className="gameResultOverlay" role="presentation">
          <div
            aria-labelledby="library-verdict-title"
            aria-modal="true"
            className={`gameResultDialog gameResult-${verdict.outcome}`}
            role="dialog"
          >
            <h2 id="library-verdict-title">{verdict.title}</h2>
            <p>{verdict.detail}</p>
            <button
              autoFocus
              className="gameResultAction"
              onClick={() => setVerdictClosed(true)}
              type="button"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
