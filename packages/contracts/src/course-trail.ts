import { z } from 'zod';

/** Slug of an activity of the new course "do zero" (content lives in versioned web files). */
export const courseTrailActivityIdSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

export const courseTrailProgressSchema = z.object({
  completedActivityIds: z.array(courseTrailActivityIdSchema),
});
export type CourseTrailProgress = z.infer<typeof courseTrailProgressSchema>;
