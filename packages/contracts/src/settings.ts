import { z } from 'zod';

// The password is never returned by the API once set — only whether one is
// configured. Admins re-enter it to change it; leaving it blank on update
// keeps the previously stored value.
export const smtpSettingsSchema = z.object({
  fromAddress: z.string().email().nullable(),
  fromName: z.string().nullable(),
  hasPassword: z.boolean(),
  host: z.string().nullable(),
  port: z.number().int().min(1).max(65_535).nullable(),
  secure: z.boolean(),
  username: z.string().nullable(),
});

export const updateSmtpSettingsInputSchema = z.object({
  fromAddress: z.string().trim().email(),
  fromName: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(500).nullable().optional(),
  port: z.number().int().min(1).max(65_535),
  secure: z.boolean(),
  username: z.string().trim().max(255).nullable(),
});

export const sendTestEmailInputSchema = z.object({
  toEmail: z.string().trim().email(),
});

// The access token is never returned by the API once set — only whether one
// is configured. Admins re-enter it to change it; leaving it blank on update
// keeps the previously stored value. The public key is not secret but is
// still admin-only for now since checkout isn't built yet (SP-I).
export const mercadoPagoSettingsSchema = z.object({
  environment: z.enum(['sandbox', 'production']),
  hasAccessToken: z.boolean(),
  publicKey: z.string().nullable(),
});

export const updateMercadoPagoSettingsInputSchema = z.object({
  accessToken: z.string().trim().min(1).max(500).nullable().optional(),
  environment: z.enum(['sandbox', 'production']),
  publicKey: z.string().trim().max(255).nullable(),
});

export const mercadoPagoConnectionTestResultSchema = z.object({
  accountEmail: z.string().nullable(),
  connected: z.boolean(),
});

export type MercadoPagoConnectionTestResult = z.infer<typeof mercadoPagoConnectionTestResultSchema>;
export type MercadoPagoSettings = z.infer<typeof mercadoPagoSettingsSchema>;
export type SendTestEmailInput = z.infer<typeof sendTestEmailInputSchema>;
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export type UpdateMercadoPagoSettingsInput = z.infer<typeof updateMercadoPagoSettingsInputSchema>;
export type UpdateSmtpSettingsInput = z.infer<typeof updateSmtpSettingsInputSchema>;
