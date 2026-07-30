import { z } from 'zod';

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9_]+$/, 'Use apenas letras, números e sublinhado');

export const registerInputSchema = z.object({
  email: z.string().trim().email().max(254),
  username: usernameSchema,
  password: z.string().min(6).max(128),
  displayName: z.string().trim().min(2).max(80),
  referralCode: z.string().trim().min(1).max(20).optional(),
});

export const resendVerificationInputSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const verifyEmailInputSchema = z.object({
  token: z.string().min(20).max(2_048),
});

export const loginInputSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(20).max(4_096),
});

export const logoutInputSchema = refreshInputSchema;

export const forgotPasswordInputSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const resetPasswordInputSchema = z.object({
  token: z.string().min(20).max(2_048),
  newPassword: z.string().min(6).max(128),
});

const MIN_BIRTH_DATE = '1900-01-01';

export const updateMeInputSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    avatarUrl: z.string().url().max(2_048).nullable().optional(),
    countryCode: z.string().trim().length(2).toUpperCase().nullable().optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    locale: z.string().trim().min(2).max(10).optional(),
    birthDate: z.iso
      .date()
      .nullable()
      .optional()
      .refine(
        (value) => value == null || (value >= MIN_BIRTH_DATE && value <= todayIsoDate()),
        'Data de nascimento inválida',
      ),
    bio: z.string().trim().max(500).nullable().optional(),
    isProfilePublic: z.boolean().optional(),
    boardTheme: z.enum(['classic', 'staunton_3d', 'wood']).optional(),
    suggestMoveEnabled: z.boolean().optional(),
    voiceName: z.string().trim().max(200).nullable().optional(),
    reviewNarrationEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma configuração');

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export const uploadAvatarInputSchema = z.object({
  // Small, client-resized image sent as base64 (no data: prefix).
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataBase64: z.string().min(1).max(1_400_000),
});

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string(),
  status: z.enum(['pending', 'active', 'suspended', 'deleted']),
  emailVerifiedAt: z.string().datetime().nullable(),
  profile: z.object({
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    countryCode: z.string().nullable(),
    timezone: z.string(),
    locale: z.string(),
    birthDate: z.iso.date().nullable(),
    bio: z.string().nullable(),
    isProfilePublic: z.boolean(),
    boardTheme: z.enum(['classic', 'staunton_3d', 'wood']),
    suggestMoveEnabled: z.boolean(),
    voiceName: z.string().nullable(),
    reviewNarrationEnabled: z.boolean(),
  }),
});

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresIn: z.number().int().positive(),
  refreshToken: z.string(),
  refreshTokenExpiresIn: z.number().int().positive(),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationInputSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type RefreshInput = z.infer<typeof refreshInputSchema>;
export type LogoutInput = z.infer<typeof logoutInputSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;
export type UpdateMeInput = z.infer<typeof updateMeInputSchema>;
export type UploadAvatarInput = z.infer<typeof uploadAvatarInputSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
