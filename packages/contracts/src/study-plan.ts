import { z } from 'zod';

export const studyThemeSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Why this theme was picked, from the player's own moves in the game. */
  reason: z.string(),
  /** False when no registered exercise trains this theme (none is suggested then). */
  hasExercises: z.boolean(),
});

export const studyExerciseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  difficulty: z.string().nullable(),
  theme: z.string(),
  /** Solved by this player (saved in the database, so it shows on any device). */
  done: z.boolean(),
});

export const studyLibraryGameSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  /** One short line: what to watch for in this game. */
  focus: z.string(),
  /** Watched to the last move by this player. */
  done: z.boolean(),
});

export const gameStudyPlanSchema = z.object({
  themes: z.array(studyThemeSchema),
  exercises: z.array(studyExerciseSchema),
  libraryGames: z.array(studyLibraryGameSchema),
});
export type GameStudyPlan = z.infer<typeof gameStudyPlanSchema>;
export type StudyTheme = z.infer<typeof studyThemeSchema>;
