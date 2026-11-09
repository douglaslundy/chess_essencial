'use client';

import type { OpeningDetail, OpeningLine } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { OpeningPlay } from './opening-play';
import { pickVariations } from './variations';
import { CoachCallout } from '@/components/coach/coach-callout';
import { ChessBoard, type BoardOrientation } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';
import { speakableSquares, toBrazilianSan } from '@/lib/notation';
import { usePieceTheme } from '@/lib/piece-theme';
import { prefetchSpeech, speak, stopSpeaking } from '@/lib/speech';
import { useVoicePreference } from '@/lib/voice-preference';

const POLL_MS = 3_000;
const REPLY_DELAY_MS = 600;
const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';

type Mode = 'play' | 'practice' | 'study';

interface Step {
  fen: string;
  from: string;
  san: string;
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
      san: move.san,
      to: move.to,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
    });
  }
  return { start, steps };
}

const gamesLabel = (line: OpeningLine) =>
  line.games ? ` · ${line.games.toLocaleString('pt-BR')} partidas` : '';

/** The part of the name after the family: "Najdorf Variation". */
const variationName = (line: OpeningLine) =>
  line.name.split(':').slice(1).join(':').trim() || line.name;

export function OpeningStudy({ openingId }: { openingId: string }) {
  const { theme: pieceTheme } = usePieceTheme();
  const { voiceName } = useVoicePreference();
  const [detail, setDetail] = useState<OpeningDetail | null>(null);
  const [siblings, setSiblings] = useState<OpeningLine[]>([]);
  const [message, setMessage] = useState('Carregando a abertura…');
  const [mode, setMode] = useState<Mode>('study');
  const [ply, setPly] = useState(0);
  const [audio, setAudio] = useState(true);
  const [flipped, setFlipped] = useState(false);
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

  // The other variations of the same opening, most played first.
  const family = detail?.line.family;
  useEffect(() => {
    if (!family) return;
    api
      .searchOpenings({ family }, token())
      .then(setSiblings)
      .catch(() => undefined);
  }, [family]);
  const variations = useMemo(() => pickVariations(siblings), [siblings]);

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
        if (next.lesson.status === 'generating') {
          timer = window.setTimeout(() => void tick(), POLL_MS);
        }
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
  const side: BoardOrientation = line?.side ?? 'white';
  const orientation: BoardOrientation = flipped ? (side === 'white' ? 'black' : 'white') : side;
  const fen = ply === 0 ? (built?.start ?? '') : (built?.steps[ply - 1]?.fen ?? '');
  const frame = detail?.lesson.frames.find((item) => item.index === ply) ?? null;

  // Stored voices: the first student triggers generation, the next ones play the saved audio.
  const frameTexts = detail?.lesson.status === 'completed' ? detail.lesson.frames : null;
  useEffect(() => {
    if (!frameTexts || !detail || !audio) return;
    prefetchSpeech(
      [detail.lesson.overview, ...frameTexts.map((item) => item.text)].map(speakableSquares),
      voiceName,
    );
  }, [frameTexts, detail, voiceName, audio]);

  const studyText = ply === 0 ? (detail?.lesson.overview ?? '') : (frame?.text ?? '');
  useEffect(() => {
    if (mode !== 'study' || !studyText || !audio) return;
    speak(speakableSquares(studyText), { interrupt: true, voiceName }).catch(() => undefined);
    return () => stopSpeaking();
  }, [mode, studyText, voiceName, audio]);

  // Practice: the student plays their side from memory; the other side answers by itself.
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

  function changeMode(next: Mode) {
    stopSpeaking();
    savedRef.current = false;
    setWrongOnce(false);
    setPracticeNote('');
    setMode(next);
    setPly(0);
  }

  if (!detail || !line || !built) {
    return (
      <main className="gamePage">
        <p className="gameMessage" role="status">
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
  const rowCount = Math.ceil(total / 2);
  const variationLink = (item: OpeningLine, label: string) => (
    <Link
      aria-current={item.id === line.id ? 'page' : undefined}
      href={`/app/aberturas/${item.id}`}
      key={item.id}
    >
      {label}
      <small>{gamesLabel(item)}</small>
    </Link>
  );

  return (
    <main className="gamePage">
      <aside className="playersColumn">
        <div className="libraryGameInfo">
          <strong>{line.family}</strong>
          <span>
            {line.name !== line.family ? `${variationName(line)} · ` : ''}
            {line.eco} · estudando de {side === 'white' ? 'brancas' : 'pretas'}
          </span>
          {detail.lesson.reviewed ? <span>✔ Explicação revisada por um enxadrista</span> : null}
          <Link href="/app/aberturas">← Aberturas</Link>
        </div>
        <div aria-label="Modo" className="libraryGameInfo openingModes" role="group">
          <button aria-pressed={mode === 'study'} onClick={() => changeMode('study')} type="button">
            Estudar
          </button>
          <button
            aria-pressed={mode === 'practice'}
            onClick={() => changeMode('practice')}
            type="button"
          >
            Treinar de memória
          </button>
          <button aria-pressed={mode === 'play'} onClick={() => changeMode('play')} type="button">
            Jogar contra o bot
          </button>
        </div>
        <nav aria-label="Variações" className="libraryGameInfo openingVariations">
          <strong>Variações mais jogadas</strong>
          {variations.base ? variationLink(variations.base, 'Linha principal') : null}
          {variations.main.map((item, index) =>
            variationLink(item, `Variação ${index + 1} · ${variationName(item)}`),
          )}
          {variations.others.length > 0 ? (
            <label>
              Outras variações
              <select
                onChange={(event) => {
                  if (event.target.value) {
                    window.location.assign(`/app/aberturas/${event.target.value}`);
                  }
                }}
                value=""
              >
                <option value="">Escolher…</option>
                {variations.others.map((item) => (
                  <option key={item.id} value={item.id}>
                    {variationName(item)}
                    {gamesLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </nav>
      </aside>

      <section className="boardColumn" aria-label="Área do tabuleiro">
        {mode === 'play' ? (
          <OpeningPlay
            detail={detail}
            key={line.id}
            pieceTheme={pieceTheme}
            voiceName={voiceName}
          />
        ) : (
          <>
            <CoachCallout
              label={
                ply === 0
                  ? 'Visão geral'
                  : `Lance ${Math.ceil(ply / 2)} · ${toBrazilianSan(last?.san ?? '')}`
              }
              message={coachMessage}
            />
            <div className="boardStage">
              <ChessBoard
                disabled={mode === 'study' || !myTurn || finished}
                fen={fen}
                lastMove={last ? { from: last.from, to: last.to } : undefined}
                movableColor={
                  mode === 'practice' && myTurn ? (side === 'white' ? 'w' : 'b') : undefined
                }
                onMove={onMove}
                orientation={orientation}
                pieceTheme={pieceTheme}
              />
              <div aria-label="Comandos do tabuleiro" className="historyControls" role="group">
                {mode === 'study' ? (
                  <>
                    <button
                      aria-label="Início"
                      disabled={ply === 0}
                      onClick={() => setPly(0)}
                      type="button"
                    >
                      ⏮
                    </button>
                    <button
                      aria-label="Lance anterior"
                      disabled={ply === 0}
                      onClick={() => setPly(ply - 1)}
                      type="button"
                    >
                      ◀
                    </button>
                    <button
                      aria-label="Próximo lance"
                      disabled={ply >= total}
                      onClick={() => setPly(ply + 1)}
                      type="button"
                    >
                      ▶
                    </button>
                    <button
                      aria-label="Fim"
                      disabled={ply >= total}
                      onClick={() => setPly(total)}
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
                  </>
                ) : null}
                <button
                  aria-label="Girar tabuleiro"
                  onClick={() => setFlipped((value) => !value)}
                  title="Girar tabuleiro"
                  type="button"
                >
                  ↻
                </button>
                {finished ? (
                  <button onClick={() => changeMode('practice')} type="button">
                    Treinar de novo
                  </button>
                ) : null}
              </div>
            </div>
            {detail.dueAt ? (
              <p className="gameMessage">
                Próxima revisão: {new Date(detail.dueAt).toLocaleString('pt-BR')}
              </p>
            ) : null}
          </>
        )}
      </section>

      <aside className="movesPanel">
        <div className="panelTabs" role="tablist" aria-label="Abertura">
          <button aria-selected="true" role="tab" type="button">
            Lances
          </button>
        </div>
        <div className="moveList" aria-label="Lista de lances">
          {Array.from({ length: rowCount }, (_, index) => (
            <div className="moveRow" key={index}>
              <span>{index + 1}.</span>
              {[index * 2 + 1, index * 2 + 2].map((movePly) => {
                const item = built.steps[movePly - 1];
                return item ? (
                  <button
                    aria-current={mode === 'study' && ply === movePly}
                    className="moveLink"
                    disabled={mode !== 'study'}
                    key={movePly}
                    onClick={() => setPly(movePly)}
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
          {line.pgn}
          {line.games ? ` · ${line.games.toLocaleString('pt-BR')} partidas` : ''}
        </div>
      </aside>
    </main>
  );
}
