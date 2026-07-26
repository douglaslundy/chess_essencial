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

// The access token and webhook secret are never returned by the API once
// set — only whether one is configured. Admins re-enter them to change;
// leaving them blank on update keeps the previously stored value. The
// public key is not secret but is still admin-only for now.
export const mercadoPagoSettingsSchema = z.object({
  environment: z.enum(['sandbox', 'production']),
  hasAccessToken: z.boolean(),
  hasWebhookSecret: z.boolean(),
  publicKey: z.string().nullable(),
});

export const updateMercadoPagoSettingsInputSchema = z.object({
  accessToken: z.string().trim().min(1).max(500).nullable().optional(),
  environment: z.enum(['sandbox', 'production']),
  publicKey: z.string().trim().max(255).nullable(),
  webhookSecret: z.string().trim().min(1).max(500).nullable().optional(),
});

export const mercadoPagoConnectionTestResultSchema = z.object({
  accountEmail: z.string().nullable(),
  connected: z.boolean(),
});

export const assistedGameSettingsSchema = z.object({
  enabled: z.boolean(),
});

export const updateAssistedGameSettingsInputSchema = z.object({
  enabled: z.boolean(),
});

// The API key is never returned by the API once set — only whether one is
// configured. Admins re-enter it to change it; leaving it blank on update
// keeps the previously stored value (same convention as SMTP/Mercado Pago).
export const narrationAiProviderSchema = z.enum(['anthropic', 'openai', 'gemini']);

export const narrationAiSettingsSchema = z.object({
  hasApiKey: z.boolean(),
  model: z.string().nullable(),
  provider: narrationAiProviderSchema.nullable(),
});

export const updateNarrationAiSettingsInputSchema = z.object({
  apiKey: z.string().trim().min(1).max(500).nullable().optional(),
  model: z.string().trim().min(1).max(120),
  provider: narrationAiProviderSchema,
});

export type AssistedGameSettings = z.infer<typeof assistedGameSettingsSchema>;
export type NarrationAiProvider = z.infer<typeof narrationAiProviderSchema>;
export type NarrationAiSettings = z.infer<typeof narrationAiSettingsSchema>;
export type UpdateNarrationAiSettingsInput = z.infer<typeof updateNarrationAiSettingsInputSchema>;
export type MercadoPagoConnectionTestResult = z.infer<typeof mercadoPagoConnectionTestResultSchema>;
export type MercadoPagoSettings = z.infer<typeof mercadoPagoSettingsSchema>;
export type SendTestEmailInput = z.infer<typeof sendTestEmailInputSchema>;
export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;
export type UpdateAssistedGameSettingsInput = z.infer<typeof updateAssistedGameSettingsInputSchema>;
export type UpdateMercadoPagoSettingsInput = z.infer<typeof updateMercadoPagoSettingsInputSchema>;
export type UpdateSmtpSettingsInput = z.infer<typeof updateSmtpSettingsInputSchema>;
