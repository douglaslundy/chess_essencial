import { z } from 'zod';

export const studyThemeSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Why this theme was picked, from the player's own moves in the game. */
  reason: z.string(),
});

export const studyExerciseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  difficulty: z.string().nullable(),
  theme: z.string(),
});

export const studyLibraryGameSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  /** One short line: what to watch for in this game. */
  focus: z.string(),
});

export const gameStudyPlanSchema = z.object({
  themes: z.array(studyThemeSchema),
  exercises: z.array(studyExerciseSchema),
  libraryGames: z.array(studyLibraryGameSchema),
});
export type GameStudyPlan = z.infer<typeof gameStudyPlanSchema>;
export type StudyTheme = z.infer<typeof studyThemeSchema>;
