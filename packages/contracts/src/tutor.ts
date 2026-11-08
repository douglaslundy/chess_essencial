import { z } from 'zod';

export const tutorKindSchema = z.enum(['library', 'exercise', 'review', 'lesson']);
export type TutorKind = z.infer<typeof tutorKindSchema>;

/** Id of the opened content: a uuid for stored content, a short slug for course lessons. */
export const tutorContentIdSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/);

/** index 0 is the overview; for games it is then the ply, for lessons the step number. */
export const tutorFrameSchema = z.object({
  index: z.number().int().nonnegative(),
  label: z.string(),
  text: z.string(),
});
export type TutorFrame = z.infer<typeof tutorFrameSchema>;

export const tutorLessonSchema = z.object({
  frames: z.array(tutorFrameSchema),
  status: z.enum(['none', 'generating', 'completed', 'failed']),
  totalSteps: z.number().int().nonnegative(),
});
export type TutorLesson = z.infer<typeof tutorLessonSchema>;

export const requestTutorLessonInputSchema = z.object({
  contentId: tutorContentIdSchema,
  kind: tutorKindSchema,
  /** Only for course lessons, whose texts live in the web app: what each step says. */
  steps: z
    .array(z.object({ say: z.string().trim().min(1).max(600) }))
    .max(80)
    .optional(),
});
