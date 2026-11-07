import { z } from 'zod';

/** Same-app route only (no external redirect): the teacher's current page, replicated on students. */
export const classroomLivePathSchema = z
  .string()
  .max(300)
  .regex(/^\/app(\/[A-Za-z0-9._~%-]+)*(\?[A-Za-z0-9._~%=&-]*)?$/);

export const createClassroomInputSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const addClassroomMemberInputSchema = z.object({
  /** Username, e-mail or user id of the student. */
  identifier: z.string().trim().min(1).max(254),
});
export const classroomLiveInputSchema = z.object({ path: classroomLivePathSchema });

export const classroomSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(['teacher', 'student']),
  teacherName: z.string(),
  studentCount: z.number().int().nonnegative(),
});
export type ClassroomSummary = z.infer<typeof classroomSummarySchema>;

export const classroomMemberSchema = z.object({
  userId: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
});
export type ClassroomMember = z.infer<typeof classroomMemberSchema>;

export const classroomDetailSchema = classroomSummarySchema.extend({
  members: z.array(classroomMemberSchema),
});
export type ClassroomDetail = z.infer<typeof classroomDetailSchema>;

export const classroomLiveSchema = z.object({
  path: classroomLivePathSchema,
  seq: z.number().int(),
});
export type ClassroomLive = z.infer<typeof classroomLiveSchema>;
