import { z } from 'zod';

export const postSchema = z.object({
  authorDisplayName: z.string(),
  authorId: z.string().uuid(),
  authorUsername: z.string(),
  body: z.string().nullable(),
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
  likeCount: z.number().int(),
  likedByMe: z.boolean(),
  mine: z.boolean(),
  photoUrl: z.string().nullable(),
});

export const createPostInputSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
    photoUrl: z.string().url().optional(),
  })
  .refine((value) => Boolean(value.body) || Boolean(value.photoUrl), {
    message: 'Informe um texto ou uma foto',
  });

export const uploadPostPhotoInputSchema = z.object({
  // Client-resized image sent as base64 (no data: prefix).
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataBase64: z.string().min(1).max(3_000_000),
});

export const uploadPostPhotoResultSchema = z.object({ photoUrl: z.string().url() });

export type CreatePostInput = z.infer<typeof createPostInputSchema>;
export type Post = z.infer<typeof postSchema>;
export type UploadPostPhotoInput = z.infer<typeof uploadPostPhotoInputSchema>;
export type UploadPostPhotoResult = z.infer<typeof uploadPostPhotoResultSchema>;
