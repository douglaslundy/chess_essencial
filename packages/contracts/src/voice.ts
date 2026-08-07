import { z } from 'zod';

export const aiVoiceIdSchema = z.enum(['openai:marin', 'openai:cedar']);

export const aiVoiceOptionSchema = z.object({
  id: aiVoiceIdSchema,
  label: z.string(),
  provider: z.literal('openai'),
});

export const aiVoiceOptionsSchema = z.object({
  items: z.array(aiVoiceOptionSchema),
});

export const synthesizeSpeechInputSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  voice: aiVoiceIdSchema,
});

export type AiVoiceId = z.infer<typeof aiVoiceIdSchema>;
export type AiVoiceOption = z.infer<typeof aiVoiceOptionSchema>;
export type AiVoiceOptions = z.infer<typeof aiVoiceOptionsSchema>;
export type SynthesizeSpeechInput = z.infer<typeof synthesizeSpeechInputSchema>;
