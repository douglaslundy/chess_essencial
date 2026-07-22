# Melhorias de partida, exercícios e desafios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 8 UX improvements to live games, exercises and challenges: bot move lag, move-history viewing, capture/check/checkmate announcements, move/capture sounds, three selectable piece/board themes, and reuse of the sound/announcement systems in Exercícios/Desafios.

**Architecture:** Two small new shared client modules (`lib/sound.ts`, `components/game/move-announcement.tsx`) get consumed by both `GameRoom` (live games) and `ExerciseTrainer` (exercises/challenges). `ChessBoard` gains a `pieceTheme` prop with three render paths (existing inline SVG, a new inline SVG "wood" set, and `<img>` tags for a pre-rendered "Staunton 3D" set already generated from a user-supplied 3D model). The bot's reply move is decoupled from the player's move commit on the backend so it can be broadcast ~1s later without delaying the player's own confirmation. Piece-theme preference is persisted server-side on `user_profiles`.

**Tech Stack:** NestJS (Fastify + `@nestjs/websockets`) backend, Next.js/React frontend, Drizzle ORM + Postgres, Vitest + Testing Library, Web Audio API (no external audio files).

## Global Constraints

- Every task must leave `pnpm --filter @xadrez/web typecheck`, `lint`, `test -- --run`, and `build` green (frontend tasks), or `pnpm --filter @xadrez/api typecheck`/`lint`/`test -- --run` green (backend tasks), before moving to the next task.
- Never use `git add -A`/`git add .` in this repo — stage only the files each task touches (many unrelated files show as modified with no real diff; staging them accidentally is a known hazard here).
- Run `npx prettier --check <files>` (and `--write` if needed) on every file you create or modify before committing.
- No new npm dependencies — everything here is built with what's already installed (`chess.js`, React, Drizzle, the Web Audio API global).
- All new user-facing strings are Portuguese (pt-BR), matching the rest of the app.
- Database changes ship as a migration pair (`.up.sql`/`.down.sql`) in `database/migrations/`, next number is `0014`. This migration does not touch `external_id LIKE 'challenge-%'` rows, so the CI rollback/reapply count gate in `.github/workflows/ci.yml` does not need updating.

---

## File Structure

| File                                                                                                            | Responsibility                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web/src/lib/sound.ts` (new)                                                                               | Web Audio synthesized move/capture sounds + mute preference (localStorage)                |
| `apps/web/src/lib/sound.test.ts` (new)                                                                          | Unit tests for the sound module                                                           |
| `apps/web/src/components/game/move-announcement.tsx` (new)                                                      | Shared "balloon" component + `describeImportantMove()` pure function                      |
| `apps/web/src/components/game/move-announcement.module.css` (new)                                               | Balloon styles                                                                            |
| `apps/web/src/components/game/move-announcement.test.tsx` (new)                                                 | Tests for the balloon + `describeImportantMove`                                           |
| `apps/api/src/games/application/games.service.ts` (modify)                                                      | New `commitPlayerMove`, `commitBotMoveIfNeeded` made public                               |
| `apps/api/src/games/presentation/games.gateway.ts` (modify)                                                     | `submitMove` broadcasts the player's move immediately, schedules the bot's reply 1s later |
| `apps/api/src/games/realtime.e2e.test.ts` (modify)                                                              | Small addition asserting the delayed-broadcast contract still round-trips                 |
| `apps/api/src/games/presentation/games.gateway.test.ts` (new)                                                   | Unit test for the 1s bot-reply delay using fake timers                                    |
| `database/migrations/0014_board_theme.up.sql` / `.down.sql` (new)                                               | `board_theme` enum + column on `user_profiles`                                            |
| `apps/api/src/database/schema.ts` (modify)                                                                      | `boardThemeEnum`, `boardTheme` column                                                     |
| `packages/contracts/src/auth.ts` (modify)                                                                       | `boardTheme` in `updateMeInputSchema` and `publicUserSchema.profile`                      |
| `api/openapi.yaml` (modify)                                                                                     | `boardTheme` in `UpdateMeInput` and `UserProfile` schemas                                 |
| `apps/api/src/users/users.service.ts` (modify)                                                                  | `boardTheme` in `toPublicUser()`                                                          |
| `apps/web/src/components/game/chess-board.tsx` (modify)                                                         | `pieceTheme` prop, `WoodChessPiece`, image-based rendering for `staunton_3d`              |
| `apps/web/src/components/game/chess-board.test.tsx` (modify)                                                    | Tests for the 3 theme render paths                                                        |
| `apps/web/src/app/globals.css` (modify)                                                                         | Board/piece theme CSS, move-history nav CSS                                               |
| `apps/web/src/lib/piece-theme.tsx` (new)                                                                        | `PieceThemeProvider` + `usePieceTheme()`                                                  |
| `apps/web/src/app/app/layout.tsx` (modify)                                                                      | Wrap with `PieceThemeProvider`                                                            |
| `apps/web/src/app/app/meus-dados/page.tsx` (modify)                                                             | Theme picker UI                                                                           |
| `apps/web/src/components/game/game-room.tsx` (modify)                                                           | Move-history navigation, balloon + sound + mute wiring, `pieceTheme`                      |
| `apps/web/src/components/game/game-room.test.tsx` (modify)                                                      | Tests for history navigation                                                              |
| `apps/web/src/components/exercises/exercise-trainer.tsx` (modify)                                               | Sound + balloon wiring, `pieceTheme`                                                      |
| `apps/web/src/components/exercises/exercise-trainer.test.tsx` (modify)                                          | Tests for sound/balloon wiring                                                            |
| `apps/web/src/components/history/review-room.tsx`, `apps/web/src/components/lessons/lesson-player.tsx` (modify) | Pass `pieceTheme` through so the preference applies platform-wide                         |

---

## Task 1: Sound module

**Files:**

- Create: `apps/web/src/lib/sound.ts`
- Test: `apps/web/src/lib/sound.test.ts`

**Interfaces:**

- Produces: `playMoveSound(): void`, `playCaptureSound(): void`, `primeAudio(): void`, `isSoundMuted(): boolean`, `setSoundMuted(muted: boolean): void`, `__resetAudioContextForTests(): void` (test-only export).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/sound.test.ts`:

```typescript
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetAudioContextForTests,
  isSoundMuted,
  playCaptureSound,
  playMoveSound,
  primeAudio,
  setSoundMuted,
} from './sound';

class MockOscillator {
  type = '';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockGainNode {
  gain = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class MockAudioContext {
  currentTime = 0;
  state: 'running' | 'suspended' = 'running';
  destination = {};
  resume = vi.fn();
  createOscillator = vi.fn(() => new MockOscillator());
  createGain = vi.fn(() => new MockGainNode());
}

describe('sound', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetAudioContextForTests();
  });

  afterEach(() => {
    // @ts-expect-error test cleanup of a global we may have set
    delete window.AudioContext;
  });

  it('defaults to unmuted and persists the mute preference', () => {
    expect(isSoundMuted()).toBe(false);
    setSoundMuted(true);
    expect(isSoundMuted()).toBe(true);
    setSoundMuted(false);
    expect(isSoundMuted()).toBe(false);
  });

  it('does not throw when AudioContext is unavailable', () => {
    // @ts-expect-error simulating a browser without Web Audio support
    delete window.AudioContext;
    expect(() => playMoveSound()).not.toThrow();
    expect(() => playCaptureSound()).not.toThrow();
    expect(() => primeAudio()).not.toThrow();
  });

  it('plays a single tone for a normal move', () => {
    const mockContext = new MockAudioContext();
    window.AudioContext = vi.fn(() => mockContext) as unknown as typeof AudioContext;
    playMoveSound();
    expect(mockContext.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('plays two tones for a capture', () => {
    const mockContext = new MockAudioContext();
    window.AudioContext = vi.fn(() => mockContext) as unknown as typeof AudioContext;
    playCaptureSound();
    expect(mockContext.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('does not play anything while muted', () => {
    const mockContext = new MockAudioContext();
    window.AudioContext = vi.fn(() => mockContext) as unknown as typeof AudioContext;
    setSoundMuted(true);
    playMoveSound();
    playCaptureSound();
    expect(mockContext.createOscillator).not.toHaveBeenCalled();
  });

  it('resumes a suspended context when primed', () => {
    const mockContext = new MockAudioContext();
    mockContext.state = 'suspended';
    window.AudioContext = vi.fn(() => mockContext) as unknown as typeof AudioContext;
    primeAudio();
    expect(mockContext.resume).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xadrez/web test -- --run sound`
Expected: FAIL with a module-not-found error for `./sound`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/sound.ts`:

```typescript
const MUTE_KEY = 'xadrez.sound_muted';

let audioContext: AudioContext | null | undefined;

function getContext(): AudioContext | null {
  if (audioContext !== undefined) return audioContext;
  if (typeof window === 'undefined') {
    audioContext = null;
    return audioContext;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  audioContext = Ctor ? new Ctor() : null;
  return audioContext;
}

export function __resetAudioContextForTests(): void {
  audioContext = undefined;
}

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTE_KEY) === 'true';
}

export function setSoundMuted(muted: boolean): void {
  window.localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false');
}

export function primeAudio(): void {
  const context = getContext();
  if (context && context.state === 'suspended') void context.resume();
}

function playTone(
  frequency: number,
  startOffsetSeconds: number,
  durationMs: number,
  context: AudioContext,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  const startTime = context.currentTime + startOffsetSeconds;
  const durationSeconds = durationMs / 1000;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds);
}

export function playMoveSound(): void {
  if (isSoundMuted()) return;
  const context = getContext();
  if (!context) return;
  playTone(660, 0, 90, context);
}

export function playCaptureSound(): void {
  if (isSoundMuted()) return;
  const context = getContext();
  if (!context) return;
  playTone(420, 0, 90, context);
  playTone(280, 0.08, 130, context);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @xadrez/web test -- --run sound`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck, lint, format**

Run: `pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint`
Expected: both clean.

Run: `npx prettier --check apps/web/src/lib/sound.ts apps/web/src/lib/sound.test.ts`
Expected: `All matched files use Prettier code style!` (if not, run with `--write` and re-check).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sound.ts apps/web/src/lib/sound.test.ts
git commit -m "feat: add synthesized move/capture sound module"
```

---

## Task 2: Move announcement balloon

**Files:**

- Create: `apps/web/src/components/game/move-announcement.tsx`
- Create: `apps/web/src/components/game/move-announcement.module.css`
- Test: `apps/web/src/components/game/move-announcement.test.tsx`

**Interfaces:**

- Produces: `type AnnouncementTone = 'neutral' | 'success' | 'danger'`, `interface Announcement { text: string; tone: AnnouncementTone; key: string }`, `describeImportantMove(move: { san: string; to: string; flags: { capture: boolean; castling: 'king_side' | 'queen_side' | null; promotion: boolean } }): { text: string; tone: AnnouncementTone } | null`, `MoveAnnouncement({ announcement }: { announcement: Announcement | null })` (React component).
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/game/move-announcement.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeImportantMove, MoveAnnouncement } from './move-announcement';

describe('describeImportantMove', () => {
  it('prioritizes checkmate over everything else', () => {
    expect(
      describeImportantMove({
        san: 'Qh7#',
        to: 'h7',
        flags: { capture: true, castling: null, promotion: false },
      }),
    ).toEqual({ text: 'Xeque-mate!', tone: 'danger' });
  });

  it('reports check when not mate', () => {
    expect(
      describeImportantMove({
        san: 'Qh7+',
        to: 'h7',
        flags: { capture: false, castling: null, promotion: false },
      }),
    ).toEqual({ text: 'Xeque!', tone: 'danger' });
  });

  it('reports promotion', () => {
    expect(
      describeImportantMove({
        san: 'e8=Q',
        to: 'e8',
        flags: { capture: false, castling: null, promotion: true },
      }),
    ).toEqual({ text: 'Promoção! e8=Q', tone: 'success' });
  });

  it('reports castling', () => {
    expect(
      describeImportantMove({
        san: 'O-O',
        to: 'g1',
        flags: { capture: false, castling: 'king_side', promotion: false },
      }),
    ).toEqual({ text: 'Roque', tone: 'neutral' });
  });

  it('reports a capture', () => {
    expect(
      describeImportantMove({
        san: 'Nxe5',
        to: 'e5',
        flags: { capture: true, castling: null, promotion: false },
      }),
    ).toEqual({ text: 'Captura em e5', tone: 'neutral' });
  });

  it('returns null for a quiet move', () => {
    expect(
      describeImportantMove({
        san: 'e4',
        to: 'e4',
        flags: { capture: false, castling: null, promotion: false },
      }),
    ).toBeNull();
  });
});

describe('MoveAnnouncement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when there is no announcement', () => {
    render(createElement(MoveAnnouncement, { announcement: null }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the announcement text and hides it after 2.5s', () => {
    render(
      createElement(MoveAnnouncement, {
        announcement: { text: 'Xeque!', tone: 'danger', key: 'move-1' },
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Xeque!');
    vi.advanceTimersByTime(2500);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xadrez/web test -- --run move-announcement`
Expected: FAIL with a module-not-found error for `./move-announcement`.

- [ ] **Step 3: Write the CSS module**

Create `apps/web/src/components/game/move-announcement.module.css`:

```css
.balloon {
  position: relative;
  justify-self: center;
  margin: 0 auto;
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  font-weight: 800;
  font-size: 0.9rem;
  text-align: center;
  width: fit-content;
  max-width: 90%;
  animation:
    pop-in 0.18s ease-out,
    fade-out 0.35s ease-in 2.15s forwards;
  box-shadow: 0 0.6rem 1.6rem rgba(0, 0, 0, 0.35);
}

.neutral {
  border: 1px solid #3f3f46;
  background: #18181b;
  color: #f8fafc;
}

.success {
  border: 1px solid #16a34a;
  background: #14532d;
  color: #dcfce7;
}

.danger {
  border: 1px solid #dc2626;
  background: #7f1d1d;
  color: #fee2e2;
}

@keyframes pop-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.92);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes fade-out {
  to {
    opacity: 0;
    transform: translateY(-6px);
  }
}
```

- [ ] **Step 4: Write the component**

Create `apps/web/src/components/game/move-announcement.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

import styles from './move-announcement.module.css';

export type AnnouncementTone = 'neutral' | 'success' | 'danger';

export interface Announcement {
  text: string;
  tone: AnnouncementTone;
  key: string;
}

const VISIBLE_DURATION_MS = 2500;

export function describeImportantMove(move: {
  san: string;
  to: string;
  flags: { capture: boolean; castling: 'king_side' | 'queen_side' | null; promotion: boolean };
}): { text: string; tone: AnnouncementTone } | null {
  if (move.san.includes('#')) return { text: 'Xeque-mate!', tone: 'danger' };
  if (move.san.includes('+')) return { text: 'Xeque!', tone: 'danger' };
  if (move.flags.promotion) return { text: `Promoção! ${move.san}`, tone: 'success' };
  if (move.flags.castling) return { text: 'Roque', tone: 'neutral' };
  if (move.flags.capture) return { text: `Captura em ${move.to}`, tone: 'neutral' };
  return null;
}

export function MoveAnnouncement({ announcement }: { announcement: Announcement | null }) {
  const [visible, setVisible] = useState<Announcement | null>(null);

  useEffect(() => {
    if (!announcement) return;
    setVisible(announcement);
    const timer = setTimeout(() => setVisible(null), VISIBLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

  if (!visible) return null;

  return (
    <div
      aria-live="polite"
      className={`${styles.balloon} ${styles[visible.tone]}`}
      key={visible.key}
      role="status"
    >
      {visible.text}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xadrez/web test -- --run move-announcement`
Expected: PASS (8 tests)

- [ ] **Step 6: Typecheck, lint, format**

Run: `pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint`
Expected: both clean.

Run: `npx prettier --check apps/web/src/components/game/move-announcement.tsx apps/web/src/components/game/move-announcement.module.css apps/web/src/components/game/move-announcement.test.tsx`
Expected: clean (or fix with `--write`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/game/move-announcement.tsx apps/web/src/components/game/move-announcement.module.css apps/web/src/components/game/move-announcement.test.tsx
git commit -m "feat: add shared move-announcement balloon component"
```

---

## Task 3: Backend — delay the bot's reply by 1 second

**Files:**

- Modify: `apps/api/src/games/application/games.service.ts:86-113` (current `commitMove`/`commitMoveSequence`/`commitBotMoveIfNeeded`)
- Modify: `apps/api/src/games/presentation/games.gateway.ts:119-139` (current `submitMove`)
- Test: Create `apps/api/src/games/presentation/games.gateway.test.ts`

**Interfaces:**

- Produces: `GamesService.commitPlayerMove(gameId: string, userId: string, input: SubmitMoveInput): Promise<{ move: GameMove; state: GameState }>` (new, gateway-only), `GamesService.commitBotMoveIfNeeded(gameId: string): Promise<{ move: GameMove; state: GameState } | null>` (existing method, made non-private).
- Consumes: nothing from Tasks 1-2.

- [ ] **Step 1: Modify `games.service.ts`**

In `apps/api/src/games/application/games.service.ts`, the current code (around lines 86-113) is:

```typescript
  async commitMove(gameId: string, userId: string, input: SubmitMoveInput) {
    const results = await this.commitMoveSequence(gameId, userId, input);
    const player = results[0]!;
    const latest = results.at(-1)!;
    return { move: player.move, state: latest.state };
  }

  async commitMoveSequence(gameId: string, userId: string, input: SubmitMoveInput) {
    try {
      const result = await this.games.commitMove(gameId, userId, input);
      if (result.state.status === 'finished') await this.ratings.processFinishedGame(gameId);
      const bot = await this.commitBotMoveIfNeeded(gameId);
      return bot ? [result, bot] : [result];
    } catch (error) {
      await this.ratings.processFinishedGame(gameId);
      throw error;
    }
  }

  private async commitBotMoveIfNeeded(gameId: string) {
    const turn = await this.games.botTurn(gameId);
    if (!turn) return null;
    const uci = selectBotMove(turn.currentFen, turn.targetRating);
    const result = await this.games.commitMove(gameId, turn.botUserId, {
      clientMoveId: randomUUID(),
      expectedVersion: turn.version,
      uci,
    });
    if (result.state.status === 'finished') await this.ratings.processFinishedGame(gameId);
    return result;
  }
```

Leave `commitMove` and `commitMoveSequence` exactly as they are (the REST endpoint `POST /:gameId/moves` in `games.controller.ts` still calls `commitMove` and expects the bot's reply embedded synchronously in the same response — the web client never calls that REST endpoint, it only uses the WebSocket gateway, so this path is unaffected by the 1s delay work). Add a new method right after `commitMoveSequence`, and change `commitBotMoveIfNeeded` from `private` to a normal method so the gateway can call it directly:

```typescript
  async commitPlayerMove(gameId: string, userId: string, input: SubmitMoveInput) {
    try {
      const result = await this.games.commitMove(gameId, userId, input);
      if (result.state.status === 'finished') await this.ratings.processFinishedGame(gameId);
      return result;
    } catch (error) {
      await this.ratings.processFinishedGame(gameId);
      throw error;
    }
  }

  async commitBotMoveIfNeeded(gameId: string) {
```

(That last line replaces `private async commitBotMoveIfNeeded(gameId: string) {` — same body, just no longer `private`.)

- [ ] **Step 2: Modify `games.gateway.ts`**

The current `submitMove` handler (around lines 119-139) is:

```typescript
  @SubscribeMessage('move.submit')
  async submitMove(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown) {
    try {
      this.consumeCommand(client, 'move.submit');
      const command = realtimeMoveSubmitSchema.parse(body);
      const userId = this.authenticatedUserId(client);
      if (!this.session(client).gameIds.has(command.gameId)) {
        throw new UnauthorizedException('Join the game before submitting a move');
      }
      const results = await this.games.commitMoveSequence(command.gameId, userId, command);
      for (const result of results) {
        this.broadcast(command.gameId, 'game.move_committed', {
          clock: this.clock(result.state),
          ...result,
        });
      }
      this.scheduleTimeout(command.gameId, results.at(-1)!.state);
    } catch (error) {
      this.fail(client, 'move.submit', error);
    }
  }
```

Replace it with:

```typescript
  private static readonly BOT_REPLY_DELAY_MS = 1000;

  @SubscribeMessage('move.submit')
  async submitMove(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown) {
    try {
      this.consumeCommand(client, 'move.submit');
      const command = realtimeMoveSubmitSchema.parse(body);
      const userId = this.authenticatedUserId(client);
      if (!this.session(client).gameIds.has(command.gameId)) {
        throw new UnauthorizedException('Join the game before submitting a move');
      }
      const result = await this.games.commitPlayerMove(command.gameId, userId, command);
      this.broadcast(command.gameId, 'game.move_committed', {
        clock: this.clock(result.state),
        ...result,
      });
      this.scheduleTimeout(command.gameId, result.state);
      this.scheduleBotReply(command.gameId);
    } catch (error) {
      this.fail(client, 'move.submit', error);
    }
  }

  private scheduleBotReply(gameId: string) {
    const timer = setTimeout(() => {
      void this.games
        .commitBotMoveIfNeeded(gameId)
        .then((bot) => {
          if (!bot) return;
          this.broadcast(gameId, 'game.move_committed', {
            clock: this.clock(bot.state),
            ...bot,
          });
          this.scheduleTimeout(gameId, bot.state);
        })
        .catch(() => {
          // No client request is pending on this delayed callback; failures here
          // (e.g. the game finished by resignation during the delay) are expected
          // and non-actionable, so there is nothing to notify.
        });
    }, GamesGateway.BOT_REPLY_DELAY_MS);
    timer.unref();
  }
```

Add the `private static readonly BOT_REPLY_DELAY_MS` field right above the `submitMove` method (inside the `GamesGateway` class, alongside the existing private fields like `clientsByGame`).

- [ ] **Step 3: Write the gateway unit test**

Create `apps/api/src/games/presentation/games.gateway.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamesGateway } from './games.gateway.js';

interface FakeSocket {
  readyState: number;
  OPEN: number;
  send: (data: string) => void;
  sent: string[];
}

function fakeSocket(): FakeSocket {
  const sent: string[] = [];
  return {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => sent.push(data),
    sent,
  };
}

function parseSent(socket: FakeSocket) {
  return socket.sent.map((raw) => JSON.parse(raw) as { data: unknown; event: string });
}

describe('GamesGateway bot reply delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('broadcasts the player move immediately and the bot move ~1s later', async () => {
    const playerState = {
      activeClockStartedAt: null,
      blackClockMs: 60000,
      currentFen: 'startpos',
      finishedAt: null,
      id: 'game-1',
      players: [],
      result: 'none',
      sideToMove: 'black',
      startedAt: null,
      status: 'active',
      termination: 'none',
      version: 1,
      whiteClockMs: 60000,
    };
    const botState = { ...playerState, sideToMove: 'white', version: 2 };
    const auth = { verifyAccessToken: vi.fn().mockResolvedValue({ userId: 'user-1' }) };
    const games = {
      commitBotMoveIfNeeded: vi.fn().mockResolvedValue({
        move: { id: 2, uci: 'e7e5' },
        state: botState,
      }),
      commitPlayerMove: vi.fn().mockResolvedValue({
        move: { id: 1, uci: 'e2e4' },
        state: playerState,
      }),
      realtimeSnapshot: vi.fn().mockResolvedValue({ moves: [], state: playerState }),
      setConnection: vi.fn().mockResolvedValue(undefined),
    };
    const metrics = { increment: vi.fn() };
    const gateway = new GamesGateway(auth as never, games as never, metrics as never);

    const socket = fakeSocket();
    gateway.handleConnection(socket as never);
    await gateway.authenticate(socket as never, { accessToken: 'token', protocolVersion: 1 });
    await gateway.join(socket as never, { gameId: 'game-1', lastKnownVersion: 0 });
    await gateway.submitMove(socket as never, {
      clientMoveId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: 0,
      gameId: 'game-1',
      uci: 'e2e4',
    });

    const beforeDelay = parseSent(socket).filter((m) => m.event === 'game.move_committed');
    expect(beforeDelay).toHaveLength(1);
    expect(games.commitBotMoveIfNeeded).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    const afterDelay = parseSent(socket).filter((m) => m.event === 'game.move_committed');
    expect(afterDelay).toHaveLength(2);
    expect(games.commitBotMoveIfNeeded).toHaveBeenCalledWith('game-1');
  });
});
```

- [ ] **Step 4: Run the new test**

Run: `pnpm --filter @xadrez/api test -- --run games.gateway`
Expected: PASS (1 test). If it fails on `authenticateCommandSchema`/`gameJoinCommandSchema`/`realtimeMoveSubmitSchema` validation, double check the payload shapes against `packages/contracts/src/realtime.ts` and adjust the fake payloads to match (do not change the schemas).

- [ ] **Step 5: Run the full API test suite**

Run: `pnpm --filter @xadrez/api test -- --run`
Expected: all passing (the pre-existing `realtime.e2e.test.ts`/`games.e2e.test.ts` are gated behind `RUN_DB_TESTS=true` and will skip locally without Docker — that's expected and unchanged from before this task).

- [ ] **Step 6: Typecheck, lint, format**

Run: `pnpm --filter @xadrez/api typecheck && pnpm --filter @xadrez/api lint`
Expected: both clean.

Run: `npx prettier --check apps/api/src/games/application/games.service.ts apps/api/src/games/presentation/games.gateway.ts apps/api/src/games/presentation/games.gateway.test.ts`
Expected: clean (or fix with `--write`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/games/application/games.service.ts apps/api/src/games/presentation/games.gateway.ts apps/api/src/games/presentation/games.gateway.test.ts
git commit -m "feat: delay the bot's reply move by 1s instead of committing it synchronously"
```

---

## Task 4: Backend — `board_theme` migration, schema, contracts, OpenAPI

**Files:**

- Create: `database/migrations/0014_board_theme.up.sql`
- Create: `database/migrations/0014_board_theme.down.sql`
- Modify: `apps/api/src/database/schema.ts`
- Modify: `packages/contracts/src/auth.ts`
- Modify: `api/openapi.yaml`
- Modify: `apps/api/src/users/users.service.ts`

**Interfaces:**

- Produces: `UpdateMeInput.boardTheme?: 'classic' | 'staunton_3d' | 'wood'`, `PublicUser.profile.boardTheme: 'classic' | 'staunton_3d' | 'wood'`.
- Consumes: nothing from Tasks 1-3.

- [ ] **Step 1: Write the migration**

Create `database/migrations/0014_board_theme.up.sql`:

```sql
CREATE TYPE board_theme AS ENUM ('classic', 'staunton_3d', 'wood');

ALTER TABLE user_profiles
  ADD COLUMN board_theme board_theme NOT NULL DEFAULT 'classic';
```

Create `database/migrations/0014_board_theme.down.sql`:

```sql
ALTER TABLE user_profiles
  DROP COLUMN board_theme;

DROP TYPE board_theme;
```

- [ ] **Step 2: Update the Drizzle schema**

In `apps/api/src/database/schema.ts`, find this line (around line 43):

```typescript
export const colorSideEnum = pgEnum('color_side', ['white', 'black']);
```

Add right after it:

```typescript
export const boardThemeEnum = pgEnum('board_theme', ['classic', 'staunton_3d', 'wood']);
```

Then find the `userProfiles` table definition (around line 63-79) and add `boardTheme` right after `allowFriendRequests`:

```typescript
  allowFriendRequests: boolean('allow_friend_requests').notNull().default(true),
  boardTheme: boardThemeEnum('board_theme').notNull().default('classic'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 3: Update contracts**

In `packages/contracts/src/auth.ts`, find `updateMeInputSchema` (around line 45-56):

```typescript
export const updateMeInputSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    avatarUrl: z.string().url().max(2_048).nullable().optional(),
    countryCode: z.string().trim().length(2).toUpperCase().nullable().optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    locale: z.string().trim().min(2).max(10).optional(),
    birthYear: z.number().int().min(1900).max(new Date().getUTCFullYear()).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    isProfilePublic: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma configuração');
```

Add `boardTheme` to the object (right after `isProfilePublic`):

```typescript
    isProfilePublic: z.boolean().optional(),
    boardTheme: z.enum(['classic', 'staunton_3d', 'wood']).optional(),
```

Then find `publicUserSchema` (around line 58-74) and add `boardTheme` to the `profile` object, right after `isProfilePublic: z.boolean(),`:

```typescript
    isProfilePublic: z.boolean(),
    boardTheme: z.enum(['classic', 'staunton_3d', 'wood']),
```

- [ ] **Step 4: Update the contracts test fixtures**

Run: `pnpm --filter @xadrez/contracts test -- --run auth`

If `packages/contracts/src/auth.test.ts` has a fixture object asserting against the full shape of `publicUserSchema` (e.g. a sample valid user object used across multiple `it()` blocks), add `boardTheme: 'classic'` to it so the fixture still validates. Read the failing assertion output to find the exact fixture object and add the field there.

- [ ] **Step 5: Update `openapi.yaml`**

In `api/openapi.yaml`, find the `UpdateMeInput` schema (around line 1146-1158):

```yaml
UpdateMeInput:
  type: object
  minProperties: 1
  properties:
    displayName: { type: string, minLength: 2, maxLength: 80 }
    avatarUrl: { type: [string, 'null'], format: uri }
    countryCode: { type: [string, 'null'], minLength: 2, maxLength: 2 }
    timezone: { type: string, minLength: 1, maxLength: 64 }
    locale: { type: string, minLength: 2, maxLength: 10 }
    birthYear: { type: [integer, 'null'], minimum: 1900 }
    bio: { type: [string, 'null'], maxLength: 500 }
    isProfilePublic: { type: boolean }
  additionalProperties: false
```

Add a `boardTheme` line right before `additionalProperties: false`:

```yaml
        isProfilePublic: {type: boolean}
        boardTheme: {type: string, enum: [classic, staunton_3d, wood]}
      additionalProperties: false
```

Then find `UserProfile` (around line 1159-1171):

```yaml
UserProfile:
  type: object
  required: [displayName, avatarUrl, countryCode, timezone, locale, birthYear, bio, isProfilePublic]
  properties:
    displayName: { type: string }
    avatarUrl: { type: [string, 'null'] }
    countryCode: { type: [string, 'null'] }
    timezone: { type: string }
    locale: { type: string }
    birthYear: { type: [integer, 'null'] }
    bio: { type: [string, 'null'] }
    isProfilePublic: { type: boolean }
  additionalProperties: false
```

Replace the `required` line and add `boardTheme`:

```yaml
UserProfile:
  type: object
  required:
    [
      displayName,
      avatarUrl,
      countryCode,
      timezone,
      locale,
      birthYear,
      bio,
      isProfilePublic,
      boardTheme,
    ]
  properties:
    displayName: { type: string }
    avatarUrl: { type: [string, 'null'] }
    countryCode: { type: [string, 'null'] }
    timezone: { type: string }
    locale: { type: string }
    birthYear: { type: [integer, 'null'] }
    bio: { type: [string, 'null'] }
    isProfilePublic: { type: boolean }
    boardTheme: { type: string, enum: [classic, staunton_3d, wood] }
  additionalProperties: false
```

- [ ] **Step 6: Regenerate the typed SDK/OpenAPI clients**

Run:

```bash
pnpm --filter @xadrez/sdk generate:api
pnpm --filter @xadrez/web generate:api
```

Expected: `packages/sdk/src/generated/openapi.ts` and `apps/web/src/lib/api/openapi.d.ts` are rewritten to include `boardTheme`.

Run: `pnpm --filter @xadrez/sdk generate:check`
Expected: exits 0 (the freshly generated file matches what's committed after step above — this is the same check CI runs).

- [ ] **Step 7: Wire `boardTheme` into the user service**

In `apps/api/src/users/users.service.ts`, find `toPublicUser` (around line 28-46):

```typescript
  private toPublicUser(user: IdentityUser): PublicUser {
    return {
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      id: user.id,
      profile: {
        avatarUrl: user.profile.avatarUrl,
        bio: user.profile.bio,
        birthYear: user.profile.birthYear,
        countryCode: user.profile.countryCode,
        displayName: user.profile.displayName,
        isProfilePublic: user.profile.isProfilePublic,
        locale: user.profile.locale,
        timezone: user.profile.timezone,
      },
      status: user.status,
      username: user.username,
    };
```

Add `boardTheme: user.profile.boardTheme,` inside the `profile` object (alphabetically, right after `birthYear`):

```typescript
        birthYear: user.profile.birthYear,
        boardTheme: user.profile.boardTheme,
        countryCode: user.profile.countryCode,
```

No changes are needed in `apps/api/src/users/users.repository.ts` — `updateProfile()` already does `.set({ ...input, updatedAt: new Date() })`, so a `boardTheme` field on the incoming `UpdateMeInput` is persisted automatically once the Drizzle column exists.

- [ ] **Step 8: Run the API test suite**

Run: `pnpm --filter @xadrez/api test -- --run`
Expected: all passing. `apps/api/src/users/*.e2e.test.ts` are gated behind `RUN_DB_TESTS=true` (skip locally, validated by CI's `database-integration` job against the real migration).

- [ ] **Step 9: Typecheck, lint, format across the touched packages**

Run:

```bash
pnpm --filter @xadrez/contracts typecheck && pnpm --filter @xadrez/contracts lint
pnpm --filter @xadrez/api typecheck && pnpm --filter @xadrez/api lint
pnpm --filter @xadrez/sdk typecheck && pnpm --filter @xadrez/sdk lint
pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint
```

Expected: all clean.

Run: `npx prettier --check database/migrations/0014_board_theme.up.sql database/migrations/0014_board_theme.down.sql apps/api/src/database/schema.ts apps/api/src/users/users.service.ts packages/contracts/src/auth.ts api/openapi.yaml packages/sdk/src/generated/openapi.ts apps/web/src/lib/api/openapi.d.ts`
Expected: clean (or fix with `--write`; note `generate:api` already ran Prettier on the SDK file per its own script).

- [ ] **Step 10: Commit**

```bash
git add database/migrations/0014_board_theme.up.sql database/migrations/0014_board_theme.down.sql apps/api/src/database/schema.ts apps/api/src/users/users.service.ts packages/contracts/src/auth.ts packages/contracts/src/auth.test.ts api/openapi.yaml packages/sdk/src/generated/openapi.ts apps/web/src/lib/api/openapi.d.ts
git commit -m "feat: add board_theme profile field (migration, schema, contracts, OpenAPI)"
```

(Only add `packages/contracts/src/auth.test.ts` to that list if Step 4 actually required a fixture change.)

---

## Task 5: `ChessBoard` — three piece themes

**Files:**

- Modify: `apps/web/src/components/game/chess-board.tsx`
- Modify: `apps/web/src/components/game/chess-board.test.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**

- Produces: `ChessBoardProps.pieceTheme?: 'classic' | 'staunton_3d' | 'wood'` (default `'classic'`).
- Consumes: the 12 PNG files already committed at `apps/web/public/piece-themes/staunton-3d/{white,black}-{king,queen,bishop,knight,rook,pawn}.png` (generated earlier this session from the user-supplied 3D model).

- [ ] **Step 1: Add the theme prop and a `WoodChessPiece` renderer**

In `apps/web/src/components/game/chess-board.tsx`, find the `pieceNames` map near the top (around line 6-13):

```typescript
const pieceNames: Record<PieceSymbol, string> = {
  k: 'rei',
  q: 'dama',
  r: 'torre',
  b: 'bispo',
  n: 'cavalo',
  p: 'peão',
};
```

Add a second map right after it, for the Staunton 3D image filenames:

```typescript
const pieceFileNames: Record<PieceSymbol, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

export type PieceTheme = 'classic' | 'staunton_3d' | 'wood';
```

Find the closing brace of the existing `ChessPiece` function (it ends around line 78-79, right before `function diagramPieces`). Add a new `WoodChessPiece` function right after `ChessPiece`'s closing brace:

```typescript
function WoodChessPiece({ color, type }: BoardPiece) {
  return (
    <svg
      aria-hidden="true"
      className={`chessPiece woodPiece ${color === 'w' ? 'whitePiece' : 'blackPiece'}`}
      data-color={color}
      data-piece={type}
      focusable="false"
      viewBox="0 0 64 64"
    >
      <path className="woodBase" d="M14 50h36l4 8H10l4-8Z" />
      <path className="woodBase" d="M20 42h24l3 8H17l3-8Z" />
      {type === 'p' ? <circle className="woodBody" cx="32" cy="28" r="11" /> : null}
      {type === 'r' ? (
        <>
          <rect className="woodBody" height="28" rx="3" width="22" x="21" y="14" />
          <path className="woodBody" d="M19 14h4v-5h6v5h6v-5h6v5h4v6H19v-6Z" />
        </>
      ) : null}
      {type === 'n' ? (
        <path
          className="woodBody"
          d="M24 42c-1-10 1-18 8-23l-3-6c9 2 14 9 13 18l3 11c1 3-1 5-4 5h-4l-2-6-3 6h-8Z"
        />
      ) : null}
      {type === 'b' ? (
        <>
          <ellipse className="woodBody" cx="32" cy="30" rx="10" ry="16" />
          <circle className="woodBody" cx="32" cy="10" r="4" />
          <path className="woodDetail" d="M26 24 38 30" fill="none" stroke="currentColor" strokeWidth="2" />
        </>
      ) : null}
      {type === 'q' ? (
        <>
          <ellipse className="woodBody" cx="32" cy="32" rx="12" ry="14" />
          <circle className="woodDetail" cx="32" cy="10" r="4" />
          <circle className="woodDetail" cx="18" cy="16" r="3" />
          <circle className="woodDetail" cx="46" cy="16" r="3" />
          <circle className="woodDetail" cx="24" cy="12" r="3" />
          <circle className="woodDetail" cx="40" cy="12" r="3" />
        </>
      ) : null}
      {type === 'k' ? (
        <>
          <ellipse className="woodBody" cx="32" cy="32" rx="12" ry="15" />
          <rect className="woodDetail" height="14" width="6" x="29" y="4" />
          <rect className="woodDetail" height="6" width="16" x="24" y="8" />
        </>
      ) : null}
    </svg>
  );
}

function StauntonPieceImage({ color, type }: BoardPiece) {
  const colorName = color === 'w' ? 'white' : 'black';
  return (
    <img
      alt=""
      aria-hidden="true"
      className={`pieceImage ${color === 'w' ? 'whitePiece' : 'blackPiece'}`}
      data-color={color}
      data-piece={type}
      src={`/piece-themes/staunton-3d/${colorName}-${pieceFileNames[type]}.png`}
    />
  );
}

function renderPiece(piece: BoardPiece, theme: PieceTheme) {
  if (theme === 'staunton_3d') return <StauntonPieceImage color={piece.color} type={piece.type} />;
  if (theme === 'wood') return <WoodChessPiece color={piece.color} type={piece.type} />;
  return <ChessPiece color={piece.color} type={piece.type} />;
}
```

- [ ] **Step 2: Thread the prop through `ChessBoardProps` and the render**

Find `ChessBoardProps` (around line 110-117):

```typescript
interface ChessBoardProps {
  fen: string;
  orientation: BoardOrientation;
  disabled?: boolean;
  lastMove?: { from: string; to: string } | undefined;
  movableColor?: Color | undefined;
  onMove: (uci: string) => void;
}
```

Add `pieceTheme`:

```typescript
interface ChessBoardProps {
  fen: string;
  orientation: BoardOrientation;
  disabled?: boolean;
  lastMove?: { from: string; to: string } | undefined;
  movableColor?: Color | undefined;
  onMove: (uci: string) => void;
  pieceTheme?: PieceTheme;
}
```

Find the destructured props in `export function ChessBoard({...})` (around line 119-126) and add `pieceTheme = 'classic'`:

```typescript
export function ChessBoard({
  fen,
  orientation,
  disabled,
  lastMove,
  movableColor,
  onMove,
  pieceTheme = 'classic',
}: ChessBoardProps) {
```

Find the `<div className="chessBoard" ...>` opening tag (around line 211) and add the `data-board-theme` attribute:

```typescript
        <div className="chessBoard" data-board-theme={pieceTheme} role="grid" aria-label="Tabuleiro de xadrez">
```

Find the line rendering the piece inside `squares.map` (around line 248):

```typescript
                {piece ? <ChessPiece color={piece.color} type={piece.type} /> : null}
```

Replace with:

```typescript
{
  piece ? renderPiece(piece, pieceTheme) : null;
}
```

- [ ] **Step 3: Add board/piece theme CSS**

In `apps/web/src/app/globals.css`, find the `.blackPiece` rule (around line 781-784):

```css
.blackPiece {
  --piece-outline: #eadcc5;
  color: #181717;
}
```

Add the following block right after it:

```css
.boardSquare > .pieceImage {
  position: relative;
  z-index: 2;
  width: 78%;
  height: 78%;
  object-fit: contain;
  filter: drop-shadow(0 0.12rem 0.15rem rgba(0, 0, 0, 0.4));
}

.woodPiece .woodBase {
  fill: #6b3f22;
}

.whitePiece.woodPiece .woodBody {
  fill: #e8c39e;
  stroke: #6b3f22;
  stroke-width: 1.5;
}

.blackPiece.woodPiece .woodBody {
  fill: #3e2415;
  stroke: #1c110a;
  stroke-width: 1.5;
}

.whitePiece.woodPiece .woodDetail {
  fill: #6b3f22;
}

.blackPiece.woodPiece .woodDetail {
  fill: #e8c39e;
}

[data-board-theme='wood'] .lightSquare {
  background: #d8b384;
}

[data-board-theme='wood'] .darkSquare {
  background: #7a4a26;
}

[data-board-theme='staunton_3d'] .lightSquare {
  background: #e4ddd0;
}

[data-board-theme='staunton_3d'] .darkSquare {
  background: #4b4038;
}
```

- [ ] **Step 4: Add tests for the three theme render paths**

In `apps/web/src/components/game/chess-board.test.tsx`, add the following `it()` blocks inside the existing `describe('ChessBoard', ...)` block (after the existing tests):

```typescript
it('renders classic SVG pieces by default', () => {
  render(
    createElement(ChessBoard, {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      onMove: vi.fn(),
      orientation: 'white',
    }),
  );
  expect(document.querySelectorAll('svg.chessPiece').length).toBe(32);
  expect(document.querySelectorAll('img.pieceImage').length).toBe(0);
});

it('renders Staunton 3D pieces as images when pieceTheme is staunton_3d', () => {
  render(
    createElement(ChessBoard, {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      onMove: vi.fn(),
      orientation: 'white',
      pieceTheme: 'staunton_3d',
    }),
  );
  const images = document.querySelectorAll<HTMLImageElement>('img.pieceImage');
  expect(images.length).toBe(32);
  expect(images[0]?.src).toContain('/piece-themes/staunton-3d/');
});

it('renders wood SVG pieces when pieceTheme is wood', () => {
  render(
    createElement(ChessBoard, {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      onMove: vi.fn(),
      orientation: 'white',
      pieceTheme: 'wood',
    }),
  );
  expect(document.querySelectorAll('svg.woodPiece').length).toBe(32);
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @xadrez/web test -- --run chess-board`
Expected: PASS (all existing tests plus the 3 new ones).

- [ ] **Step 6: Typecheck, lint, format**

Run: `pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint`
Expected: both clean.

Run: `npx prettier --check apps/web/src/components/game/chess-board.tsx apps/web/src/components/game/chess-board.test.tsx apps/web/src/app/globals.css`
Expected: clean (or fix with `--write`).

- [ ] **Step 7: Visually verify in the dev server**

Use the `/run` skill (or `pnpm --filter @xadrez/web dev`) to open `/app/jogar` (or the demo board) and manually check all 6 wood-theme piece shapes render as recognizable, distinct pieces at actual board size — the SVG paths above were designed without live visual feedback. If any wood piece looks wrong (disproportionate, unrecognizable, clipped by the viewBox), adjust its path/primitive coordinates in `WoodChessPiece` and re-run Step 5.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/game/chess-board.tsx apps/web/src/components/game/chess-board.test.tsx apps/web/src/app/globals.css
git commit -m "feat: add wood and Staunton 3D piece themes to ChessBoard"
```

---

## Task 6: Piece theme preference — context, provider, Meus Dados selector

**Files:**

- Create: `apps/web/src/lib/piece-theme.tsx`
- Modify: `apps/web/src/app/app/layout.tsx`
- Modify: `apps/web/src/app/app/meus-dados/page.tsx`
- Modify: `apps/web/src/components/game/game-room.tsx`
- Modify: `apps/web/src/components/exercises/exercise-trainer.tsx`
- Modify: `apps/web/src/components/history/review-room.tsx`
- Modify: `apps/web/src/components/lessons/lesson-player.tsx`

**Interfaces:**

- Consumes: `ChessBoardProps.pieceTheme` (Task 5), `PublicUser.profile.boardTheme` / `UpdateMeInput.boardTheme` (Task 4).
- Produces: `PieceThemeProvider({ children })`, `usePieceTheme(): { theme: PieceTheme; setTheme: (theme: PieceTheme) => void }`.

- [ ] **Step 1: Write the context module**

Create `apps/web/src/lib/piece-theme.tsx`:

```typescript
'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '@/lib/api/client';
import type { PieceTheme } from '@/components/game/chess-board';

interface PieceThemeContextValue {
  theme: PieceTheme;
  setTheme: (theme: PieceTheme) => void;
}

const PieceThemeContext = createContext<PieceThemeContextValue>({
  setTheme: () => {},
  theme: 'classic',
});

export function PieceThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<PieceTheme>('classic');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) return;
      api
        .getMe(token)
        .then((user) => setThemeState(user.profile.boardTheme))
        .catch(() => undefined);
    });
  }, []);

  const setTheme = useCallback((next: PieceTheme) => {
    setThemeState(next);
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    void api.updateMe({ boardTheme: next }, token).catch(() => undefined);
  }, []);

  return <PieceThemeContext.Provider value={{ setTheme, theme }}>{children}</PieceThemeContext.Provider>;
}

export function usePieceTheme(): PieceThemeContextValue {
  return useContext(PieceThemeContext);
}
```

- [ ] **Step 2: Wrap the authenticated app shell**

Replace the full contents of `apps/web/src/app/app/layout.tsx`:

```typescript
import type { ReactNode } from 'react';

import { AppChrome } from '@/components/navigation/app-chrome';
import { PieceThemeProvider } from '@/lib/piece-theme';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PieceThemeProvider>
      <AppChrome>{children}</AppChrome>
    </PieceThemeProvider>
  );
}
```

- [ ] **Step 3: Wire `usePieceTheme()` into every `ChessBoard` consumer**

In `apps/web/src/components/game/game-room.tsx`, add the import near the top (alongside the existing `@/lib/...` imports):

```typescript
import { usePieceTheme } from '@/lib/piece-theme';
```

Inside `export function GameRoom({ gameId }: { gameId: string })`, right after the existing `const isDemo = gameId === 'demo';` line, add:

```typescript
const { theme: pieceTheme } = usePieceTheme();
```

Find the `<ChessBoard ... />` element and add `pieceTheme={pieceTheme}` as a prop (any position in the prop list is fine, e.g. right after `orientation={orientation}` at the end).

In `apps/web/src/components/exercises/exercise-trainer.tsx`, add the same import:

```typescript
import { usePieceTheme } from '@/lib/piece-theme';
```

Inside `export function ExerciseTrainer({...})`, right after the existing `const [category, setCategory] = useState('');` line, add:

```typescript
const { theme: pieceTheme } = usePieceTheme();
```

Find the `<ChessBoard ... />` element and add `pieceTheme={pieceTheme}` to its props.

In `apps/web/src/components/history/review-room.tsx` and `apps/web/src/components/lessons/lesson-player.tsx`, apply the same two changes: import `usePieceTheme` from `@/lib/piece-theme`, call `const { theme: pieceTheme } = usePieceTheme();` inside the component function, and add `pieceTheme={pieceTheme}` to that file's `<ChessBoard ... />` element(s). Match the existing prop style in each file exactly (both files already render at least one `<ChessBoard>`; if a file renders more than one, add the prop to all of them).

- [ ] **Step 4: Add the theme picker to Meus Dados**

In `apps/web/src/app/app/meus-dados/page.tsx`, add the import:

```typescript
import { usePieceTheme } from '@/lib/piece-theme';
```

Inside `export default function MyDataPage()`, right after `const [message, setMessage] = useState('Carregando seus dados…');`, add:

```typescript
const { theme: pieceTheme, setTheme: setPieceTheme } = usePieceTheme();
const themeOptions: { value: 'classic' | 'staunton_3d' | 'wood'; label: string }[] = [
  { label: 'Clássico', value: 'classic' },
  { label: 'Staunton 3D', value: 'staunton_3d' },
  { label: 'Madeira', value: 'wood' },
];
```

Find the closing `</form>` tag (right before the final `) : null}` and `</main>`) and add a new section right after `</form>`:

```typescript
        </form>
      ) : null}
      {user ? (
        <section className={styles.formCard} aria-label="Tema do tabuleiro">
          <h2>Tema do tabuleiro e peças</h2>
          <div className="sourceFilterPreview" role="group" aria-label="Escolher tema">
            {themeOptions.map((option) => (
              <button
                aria-pressed={pieceTheme === option.value}
                key={option.value}
                onClick={() => setPieceTheme(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
```

(Note: this introduces a `</form>` immediately followed by a sibling `{user ? (...) : null}` block — read the surrounding JSX carefully before editing so the existing `{user ? (<form>...</form>) : null}` structure is preserved and this new block is a second, separate `{user ? (...) : null}` right after it, not nested inside the form.)

- [ ] **Step 5: Add minimal CSS for the theme picker buttons**

In `apps/web/src/app/globals.css`, add (anywhere near the other button-group rules, e.g. right after the `.moveRow .moveLink` rules added in Task 7 if that task ran first, otherwise anywhere in the file):

```css
.sourceFilterPreview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.sourceFilterPreview button {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--surface-2);
  color: var(--text);
  padding: 0.6rem 1.1rem;
  font-weight: 700;
  cursor: pointer;
}

.sourceFilterPreview button[aria-pressed='true'] {
  border-color: var(--red-bright);
  background: var(--red-bright);
  color: #1c1917;
}
```

- [ ] **Step 6: Run the web test suite**

Run: `pnpm --filter @xadrez/web test -- --run`
Expected: all passing (this task doesn't add new test files, but must not break `game-room.test.tsx`, `exercise-trainer.test.tsx`, or any other existing suite).

- [ ] **Step 7: Typecheck, lint, format**

Run: `pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint`
Expected: both clean.

Run: `npx prettier --check apps/web/src/lib/piece-theme.tsx apps/web/src/app/app/layout.tsx apps/web/src/app/app/meus-dados/page.tsx apps/web/src/components/game/game-room.tsx apps/web/src/components/exercises/exercise-trainer.tsx apps/web/src/components/history/review-room.tsx apps/web/src/components/lessons/lesson-player.tsx apps/web/src/app/globals.css`
Expected: clean (or fix with `--write`).

- [ ] **Step 8: Build and visually verify**

Run: `pnpm --filter @xadrez/web build`
Expected: succeeds, `/app/meus-dados` still in the route manifest.

Use `/run` to open `/app/meus-dados`, click each of the 3 theme buttons, and confirm the active one gets `aria-pressed="true"` styling and that navigating to `/app/jogar` (demo board) reflects the chosen theme.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/piece-theme.tsx apps/web/src/app/app/layout.tsx apps/web/src/app/app/meus-dados/page.tsx apps/web/src/components/game/game-room.tsx apps/web/src/components/exercises/exercise-trainer.tsx apps/web/src/components/history/review-room.tsx apps/web/src/components/lessons/lesson-player.tsx apps/web/src/app/globals.css
git commit -m "feat: add piece/board theme picker to Meus Dados, wired into every board"
```

---

## Task 7: Move-history navigation in `GameRoom`

**Files:**

- Modify: `apps/web/src/components/game/game-room.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: Create `apps/web/src/components/game/game-room.test.tsx`

**Interfaces:**

- Consumes: `GameMove.fenAfter`, `GameMove.ply` (existing contract fields).
- Produces: nothing consumed by later tasks (self-contained UI feature).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/game/game-room.test.tsx`:

```typescript
// @vitest-environment jsdom
import type { GameMove } from '@xadrez/contracts';
import { describe, expect, it } from 'vitest';

import { historyBaseIndex, stepHistoryIndex } from './game-room';

function move(ply: number, fenAfter: string): GameMove {
  return {
    clientMoveId: `move-${ply}`,
    color: ply % 2 === 1 ? 'white' : 'black',
    committedAt: new Date().toISOString(),
    fenAfter,
    fenBefore: fenAfter,
    flags: { capture: false, castling: null, enPassant: false, promotion: false },
    from: 'e2',
    id: ply,
    ply,
    promotion: null,
    san: 'e4',
    to: 'e4',
    uci: 'e2e4',
  };
}

describe('history navigation helpers', () => {
  const moves = [move(1, 'fen-1'), move(2, 'fen-2'), move(3, 'fen-3')];

  it('treats "live" (null) as the last move for stepping purposes', () => {
    expect(historyBaseIndex(null, moves)).toBe(2);
  });

  it('steps back one move at a time, clamped at the first move', () => {
    expect(stepHistoryIndex(null, -1, moves)).toBe(1);
    expect(stepHistoryIndex(1, -1, moves)).toBe(0);
    expect(stepHistoryIndex(0, -1, moves)).toBe(0);
  });

  it('steps forward one move at a time, clamped at the last move', () => {
    expect(stepHistoryIndex(0, 1, moves)).toBe(1);
    expect(stepHistoryIndex(2, 1, moves)).toBe(2);
  });

  it('does nothing meaningful with zero moves', () => {
    expect(stepHistoryIndex(null, -1, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @xadrez/web test -- --run game-room`
Expected: FAIL — `historyBaseIndex`/`stepHistoryIndex` are not exported yet.

- [ ] **Step 3: Add the pure helpers and history state to `game-room.tsx`**

In `apps/web/src/components/game/game-room.tsx`, add these two exported pure functions right after the existing `formatMove` function (which ends around line 29):

```typescript
export function historyBaseIndex(viewIndex: number | null, moves: GameMove[]): number {
  return viewIndex ?? moves.length - 1;
}

export function stepHistoryIndex(
  viewIndex: number | null,
  offset: -1 | 1,
  moves: GameMove[],
): number | null {
  if (moves.length === 0) return null;
  const base = historyBaseIndex(viewIndex, moves);
  return Math.max(0, Math.min(moves.length - 1, base + offset));
}
```

Inside `export function GameRoom({ gameId }: { gameId: string })`, right after the existing `const [resigning, setResigning] = useState(false);` line, add:

```typescript
const [viewIndex, setViewIndex] = useState<number | null>(null);
const previousMoveCount = useRef(0);
```

Right after the existing `const lastMove = moves.at(-1);` line, add:

```typescript
useEffect(() => {
  setViewIndex((current) => {
    if (
      current !== null &&
      current === previousMoveCount.current - 1 &&
      moves.length > previousMoveCount.current
    ) {
      return moves.length - 1;
    }
    return current;
  });
  previousMoveCount.current = moves.length;
}, [moves.length]);

const viewingHistory = viewIndex !== null;
const viewedMove = viewingHistory ? moves[viewIndex] : undefined;
const displayFen = viewedMove ? viewedMove.fenAfter : state.currentFen;

function viewMove(ply: number) {
  setViewIndex(ply - 1);
}

function stepView(offset: -1 | 1) {
  setViewIndex((current) => stepHistoryIndex(current, offset, moves));
}

function returnToLive() {
  setViewIndex(null);
}
```

- [ ] **Step 4: Wire the board and add the navigation UI**

Find the `<ChessBoard ... />` element (from Task 6, it already has `disabled`, `fen`, `lastMove`, `movableColor`, `onMove`, `orientation`, `pieceTheme` props). Change:

```typescript
          disabled={!canMove}
          fen={state.currentFen}
```

to:

```typescript
          disabled={viewingHistory || !canMove}
          fen={displayFen}
```

Right after the closing `/>` of `<ChessBoard ... />` (still inside `<section className="boardColumn" ...>`, before the `<div className="mobilePlayer">` that follows the board), add:

```typescript
        {!isDemo ? (
          <div className="historyControls">
            <button disabled={moves.length === 0} onClick={() => stepView(-1)} type="button">
              ← Lance anterior
            </button>
            <button
              disabled={viewIndex === null || viewIndex >= moves.length - 1}
              onClick={() => stepView(1)}
              type="button"
            >
              Próximo lance →
            </button>
          </div>
        ) : null}
        {viewingHistory ? (
          <div className="historyBanner" role="status">
            Vendo lance {viewIndex! + 1} de {moves.length}
            <button onClick={returnToLive} type="button">
              Voltar ao vivo
            </button>
          </div>
        ) : null}
```

Find the `.moveRow` rendering block inside `.moveList` (in the `<aside className="movesPanel">` section):

```typescript
              <div className="moveRow" key={row.number}>
                <span>{row.number}.</span>
                <strong>{row.white ? formatMove(row.white) : ''}</strong>
                <strong>{row.black ? formatMove(row.black) : ''}</strong>
              </div>
```

Replace with:

```typescript
              <div className="moveRow" key={row.number}>
                <span>{row.number}.</span>
                {row.white ? (
                  <button
                    aria-current={viewIndex === row.white.ply - 1}
                    className="moveLink"
                    onClick={() => viewMove(row.white!.ply)}
                    type="button"
                  >
                    {formatMove(row.white)}
                  </button>
                ) : (
                  <strong />
                )}
                {row.black ? (
                  <button
                    aria-current={viewIndex === row.black.ply - 1}
                    className="moveLink"
                    onClick={() => viewMove(row.black!.ply)}
                    type="button"
                  >
                    {formatMove(row.black)}
                  </button>
                ) : (
                  <strong />
                )}
              </div>
```

Add the missing `useEffect` and `useRef` imports if not already present — check the top of the file; it currently imports `{ useEffect, useMemo, useRef, useState }` from `'react'`, so no import change is needed.

- [ ] **Step 5: Add history navigation CSS**

In `apps/web/src/app/globals.css`, find `.moveRow strong` (around line 859-864):

```css
.moveRow strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 0.78rem;
  line-height: 1.35;
}
```

Replace with:

```css
.moveRow strong,
.moveRow .moveLink {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 0.78rem;
  line-height: 1.35;
}

.moveRow .moveLink {
  border: 0;
  border-radius: 0.3rem;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.moveRow .moveLink:hover {
  color: var(--red-bright);
}

.moveRow .moveLink[aria-current='true'] {
  color: var(--red-bright);
  text-decoration: underline;
}
```

Then add, anywhere after the `.connectionBanner` rule:

```css
.historyControls {
  display: flex;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.historyControls button {
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  background: var(--surface-2);
  color: var(--text);
  padding: 0.45rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.historyControls button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.historyBanner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.5rem;
  border: 1px solid rgba(245, 158, 11, 0.45);
  border-radius: 999px;
  background: #291c08;
  padding: 0.5rem 1rem;
  color: #fde3ad;
  font-size: 0.82rem;
  font-weight: 700;
}

.historyBanner button {
  border: 0;
  border-radius: 999px;
  background: #fde3ad;
  color: #291c08;
  padding: 0.3rem 0.8rem;
  font-weight: 800;
  cursor: pointer;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @xadrez/web test -- --run game-room`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck, lint, format**

Run: `pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint`
Expected: both clean.

Run: `npx prettier --check apps/web/src/components/game/game-room.tsx apps/web/src/components/game/game-room.test.tsx apps/web/src/app/globals.css`
Expected: clean (or fix with `--write`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/game/game-room.tsx apps/web/src/components/game/game-room.test.tsx apps/web/src/app/globals.css
git commit -m "feat: add read-only move-history navigation to live games"
```

---

## Task 8: Wire balloon + sound + mute into `GameRoom`

**Files:**

- Modify: `apps/web/src/components/game/game-room.tsx`

**Interfaces:**

- Consumes: `MoveAnnouncement`, `Announcement`, `describeImportantMove` (Task 2), `playMoveSound`, `playCaptureSound`, `primeAudio`, `isSoundMuted`, `setSoundMuted` (Task 1).

- [ ] **Step 1: Add imports and state**

In `apps/web/src/components/game/game-room.tsx`, add these imports near the top, alongside the existing component imports:

```typescript
import { MoveAnnouncement, describeImportantMove, type Announcement } from './move-announcement';
import {
  isSoundMuted,
  playCaptureSound,
  playMoveSound,
  primeAudio,
  setSoundMuted,
} from '@/lib/sound';
```

Inside `export function GameRoom(...)`, right after the `const [viewIndex, setViewIndex] = useState<number | null>(null);` line added in Task 7, add:

```typescript
const [announcement, setAnnouncement] = useState<Announcement | null>(null);
const [muted, setMuted] = useState(false);

useEffect(() => {
  setMuted(isSoundMuted());
}, []);
```

- [ ] **Step 2: Play sounds and announce on every committed move**

Find the socket handlers object passed to `new GameSocket(...)`, specifically the `move` handler:

```typescript
          move: (snapshot, move, clock) => {
            setState(snapshot);
            setMoves((current) =>
              current.some((item) => item.id === move.id) ? current : [...current, move],
            );
            setServerOffset(Date.parse(clock.serverNow) - Date.now());
            setMessage('Lance confirmado pelo servidor.');
          },
```

Replace with:

```typescript
          move: (snapshot, move, clock) => {
            setState(snapshot);
            setMoves((current) =>
              current.some((item) => item.id === move.id) ? current : [...current, move],
            );
            setServerOffset(Date.parse(clock.serverNow) - Date.now());
            setMessage('Lance confirmado pelo servidor.');
            if (move.flags.capture) playCaptureSound();
            else playMoveSound();
            const described = describeImportantMove(move);
            if (described) setAnnouncement({ ...described, key: `move-${move.id}` });
          },
```

- [ ] **Step 3: Prime the audio context on the player's own move gesture**

Find the `onMove` prop on `<ChessBoard ... />`:

```typescript
          onMove={(uci) => {
            if (isDemo) playDemoMove(uci);
            else {
              socketRef.current?.submitMove(uci);
              setMessage('Lance enviado. Aguardando confirmação do servidor…');
            }
          }}
```

Replace with:

```typescript
          onMove={(uci) => {
            primeAudio();
            if (isDemo) playDemoMove(uci);
            else {
              socketRef.current?.submitMove(uci);
              setMessage('Lance enviado. Aguardando confirmação do servidor…');
            }
          }}
```

- [ ] **Step 4: Add the mute toggle and the balloon to the JSX**

Find the `.gameActions` block (rendered when `!isDemo`):

```typescript
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
```

Replace with:

```typescript
        {!isDemo ? (
          <div className="gameActions">
            <button onClick={() => action('draw')} type="button">
              ½ Oferecer empate
            </button>
            <button className="dangerAction" onClick={() => action('resign')} type="button">
              ⚑ Desistir
            </button>
            <button
              onClick={() => {
                const next = !muted;
                setMuted(next);
                setSoundMuted(next);
              }}
              type="button"
            >
              {muted ? '🔇 Som' : '🔊 Som'}
            </button>
          </div>
        ) : null}
```

Find the `<p className="gameMessage" role="status">{message}</p>` line (inside `<section className="boardColumn" ...>`, right after the second `<div className="mobilePlayer">`). Add the balloon right before it:

```typescript
        <MoveAnnouncement announcement={announcement} />
        <p className="gameMessage" role="status">
          {message}
        </p>
```

- [ ] **Step 5: Run the web test suite**

Run: `pnpm --filter @xadrez/web test -- --run`
Expected: all passing, including `game-room.test.tsx` from Task 7.

- [ ] **Step 6: Typecheck, lint, format**

Run: `pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint`
Expected: both clean.

Run: `npx prettier --check apps/web/src/components/game/game-room.tsx`
Expected: clean (or fix with `--write`).

- [ ] **Step 7: Build**

Run: `pnpm --filter @xadrez/web build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/game/game-room.tsx
git commit -m "feat: play move/capture sounds and show important-move balloons in live games"
```

---

## Task 9: Sound + balloon in Exercícios/Desafios, verify history buttons

**Files:**

- Modify: `apps/web/src/components/exercises/exercise-trainer.tsx`
- Test: Modify `apps/web/src/components/exercises/exercise-trainer.test.tsx`

**Interfaces:**

- Consumes: `MoveAnnouncement`, `Announcement`, `describeImportantMove` (Task 2), `playMoveSound`, `playCaptureSound`, `primeAudio` (Task 1).

- [ ] **Step 1: Add imports and announcement state**

In `apps/web/src/components/exercises/exercise-trainer.tsx`, add these imports alongside the existing `import { ChessBoard } from '@/components/game/chess-board';` line:

```typescript
import {
  MoveAnnouncement,
  describeImportantMove,
  type Announcement,
} from '@/components/game/move-announcement';
import { playCaptureSound, playMoveSound, primeAudio } from '@/lib/sound';
```

Right after the existing `const [showRetryBanner, setShowRetryBanner] = useState(false);` line, add:

```typescript
const [announcement, setAnnouncement] = useState<Announcement | null>(null);
```

- [ ] **Step 2: Play a sound and derive an announcement on every board move**

Find `playBoardMove` — its first lines are:

```typescript
  function playBoardMove(uci: string) {
    if (
      !boardFen ||
      !current ||
      boardLocked ||
      current.positionType !== 'legal_position' ||
      (boardHistory && boardHistory.index < boardHistory.moves.length)
    )
      return;
    setShowRetryBanner(false);
    try {
      const chess = new Chess(boardFen);
      const move = chess.move(uciToChessMove(uci));
```

Replace those lines with:

```typescript
  function playBoardMove(uci: string) {
    if (
      !boardFen ||
      !current ||
      boardLocked ||
      current.positionType !== 'legal_position' ||
      (boardHistory && boardHistory.index < boardHistory.moves.length)
    )
      return;
    primeAudio();
    setShowRetryBanner(false);
    try {
      const chess = new Chess(boardFen);
      const move = chess.move(uciToChessMove(uci));
      if (move.captured) playCaptureSound();
      else playMoveSound();
      const described = describeImportantMove({
        san: move.san,
        to: move.to,
        flags: {
          capture: move.isCapture() || move.isEnPassant(),
          castling: move.isKingsideCastle() ? 'king_side' : move.isQueensideCastle() ? 'queen_side' : null,
          promotion: move.isPromotion(),
        },
      });
      if (described) setAnnouncement({ ...described, key: `${current.id}-${moves.length}` });
```

Note: this introduces a reference to `moves.length`, which doesn't exist in this component — use `Date.now()` instead for a unique key, since exercise moves don't have a shared move-index array like `GameRoom` does. Correct the added line to:

```typescript
if (described) setAnnouncement({ ...described, key: `${current.id}-${Date.now()}` });
```

- [ ] **Step 3: Announce success/failure on attempt submission**

Find this block inside `submit()`:

```typescript
      setTraining(attempt.training);
      resetAttemptUi();
      setLine('');
      setShowRetryBanner(!attempt.correct);
      setMessage(
```

Replace with:

```typescript
      setTraining(attempt.training);
      resetAttemptUi();
      setLine('');
      setShowRetryBanner(!attempt.correct);
      setAnnouncement({
        key: `attempt-${Date.now()}`,
        text: attempt.correct ? 'Você conseguiu!' : 'Essa não era a jogada certa.',
        tone: attempt.correct ? 'success' : 'danger',
      });
      setMessage(
```

- [ ] **Step 4: Render the balloon**

Find the `<p className={styles.status} role="status">{message}</p>` line and add the balloon right before it:

```typescript
      <MoveAnnouncement announcement={announcement} />
      <p className={styles.status} role="status">
        {message}
      </p>
```

- [ ] **Step 5: Write a test for the new wiring**

In `apps/web/src/components/exercises/exercise-trainer.test.tsx`, find an existing test that exercises `submit()` with a correct attempt and one with an incorrect attempt (search for `showRetryBanner` or `Tentar novamente` in that file to locate them). Add assertions right after the existing ones in each test:

For the correct-attempt test, add:

```typescript
expect(await screen.findByText('Você conseguiu!')).toBeInTheDocument();
```

For the incorrect-attempt test, add:

```typescript
expect(await screen.findByText('Essa não era a jogada certa.')).toBeInTheDocument();
```

If the existing tests use `screen.getByText`/`findByText` with different query helpers, match whatever pattern the surrounding test already uses instead of introducing a new one.

- [ ] **Step 6: Run the test suite**

Run: `pnpm --filter @xadrez/web test -- --run exercise-trainer`
Expected: PASS (all existing tests plus the two new assertions).

- [ ] **Step 7: Typecheck, lint, format**

Run: `pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint`
Expected: both clean.

Run: `npx prettier --check apps/web/src/components/exercises/exercise-trainer.tsx apps/web/src/components/exercises/exercise-trainer.test.tsx`
Expected: clean (or fix with `--write`).

- [ ] **Step 8: Verify the Voltar/Repetir lance buttons in both screens (spec item 7)**

Use `/run` (or `pnpm --filter @xadrez/web dev`) to open `/app/exercicios` and start a training session; pick an exercise with a board (`positionType: 'legal_position'`) and confirm "← Voltar lance" / "↻ Repetir lance" appear under the board and work (undo/redo the last move you made on the board, without submitting). Repeat on `/app/desafios`. Both screens share the same `ExerciseTrainer` component and this behavior already exists in the code (`boardControls` block, gated on `current.positionType === 'legal_position'`) — this step is a verification, not new code. If either screen is missing the buttons or they don't respond to clicks, that's a real regression: find the discrepancy (check the `guided`/`showSourceFilter` props each page passes to `<ExerciseTrainer>` in `apps/web/src/app/app/exercicios/page.tsx` and `apps/web/src/app/app/desafios/page.tsx`) and fix it before moving on.

- [ ] **Step 9: Build**

Run: `pnpm --filter @xadrez/web build`
Expected: succeeds.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/exercises/exercise-trainer.tsx apps/web/src/components/exercises/exercise-trainer.test.tsx
git commit -m "feat: play move sounds and show success/failure balloons in exercises and challenges"
```

---

## Final Verification

- [ ] Run the complete gate set once more from the repo root: `pnpm --filter @xadrez/web typecheck && pnpm --filter @xadrez/web lint && pnpm --filter @xadrez/web test -- --run && pnpm --filter @xadrez/web build && pnpm --filter @xadrez/api typecheck && pnpm --filter @xadrez/api lint && pnpm --filter @xadrez/api test -- --run && pnpm --filter @xadrez/contracts typecheck && pnpm --filter @xadrez/contracts test -- --run && pnpm --filter @xadrez/sdk generate:check`
- [ ] `git status --short` shows no unexpected staged files (never `git add -A` in this repo).
- [ ] Push to `origin/main` and confirm the VPS auto-deploy timer (`~/xadrez-essencial/.deploy/auto-deploy.log`) reaches `auto_deploy.success=<latest commit>` and all containers are healthy on the new image tag.
- [ ] Manually verify in production: bot reply feels delayed (~1s) after your move; clicking a past move in the list shows that position and blocks further moves until "Voltar ao vivo"; a capture/check/checkmate in a live game shows the balloon; moves make a sound and the mute button works; Meus Dados lets you switch between all 3 themes and the choice sticks after a reload; Exercícios/Desafios also play sounds and show the success/failure balloon.
