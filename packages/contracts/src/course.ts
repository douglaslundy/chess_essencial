import { z } from 'zod';

export const lessonStepSchema = z.object({
  bodyMd: z.string().min(1),
  expectedActions: z.array(z.record(z.string(), z.unknown())).default([]),
  feedback: z.record(z.string(), z.unknown()).default({}),
  initialFen: z.string().nullable().optional(),
  nextStepRules: z.array(z.record(z.string(), z.unknown())).default([]),
  orientation: z.enum(['white', 'black']).optional(),
  stepKey: z.string().regex(/^[a-z0-9-]+$/),
  stepType: z.enum(['text', 'board_instruction', 'quiz', 'explanation', 'checkpoint', 'summary']),
  title: z.string().max(200).optional(),
});

export const interactiveLessonSchema = z
  .object({
    estimatedMinutes: z.number().int().min(1),
    module: z.number().int().min(1).max(10),
    prerequisites: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    sourcePages: z.array(z.number().int().positive()).min(1),
    steps: z.array(lessonStepSchema).min(1),
    title: z.string().min(1).max(200),
  })
  .superRefine((lesson, context) => {
    const keys = lesson.steps.map((step) => step.stepKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'stepKey deve ser único', path: ['steps'] });
    }
    if (lesson.prerequisites.includes(lesson.slug)) {
      context.addIssue({
        code: 'custom',
        message: 'A aula não pode depender de si mesma',
        path: ['prerequisites'],
      });
    }
  });

export const saveLessonInputSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  lesson: interactiveLessonSchema,
});

export const courseSummarySchema = z.object({
  description: z.string(),
  id: z.string().uuid(),
  moduleCount: z.number().int().nonnegative(),
  slug: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  title: z.string(),
  version: z.number().int().positive(),
});

export const courseModuleSchema = z.object({
  description: z.string().nullable(),
  id: z.string().uuid(),
  lessons: z.array(
    z.object({
      estimatedMinutes: z.number().int().positive(),
      id: z.string().uuid(),
      position: z.number().int().positive(),
      slug: z.string(),
      sourcePages: z.array(z.number().int().positive()),
      status: z.enum(['draft', 'published', 'archived']),
      title: z.string(),
      version: z.number().int().positive(),
    }),
  ),
  position: z.number().int().positive(),
  sourceVolume: z.number().int().min(1).max(10),
  title: z.string(),
});

export const courseDetailSchema = courseSummarySchema.extend({
  modules: z.array(courseModuleSchema),
});

export const lessonVersionSchema = z.object({
  content: interactiveLessonSchema,
  createdAt: z.string().datetime(),
  createdByUserId: z.string().uuid(),
  lessonId: z.string().uuid(),
  version: z.number().int().positive(),
});

export type CourseDetail = z.infer<typeof courseDetailSchema>;
export type CourseSummary = z.infer<typeof courseSummarySchema>;
export type InteractiveLesson = z.infer<typeof interactiveLessonSchema>;
export type LessonVersion = z.infer<typeof lessonVersionSchema>;
export type SaveLessonInput = z.infer<typeof saveLessonInputSchema>;
