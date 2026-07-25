import { getAvailableVoices } from './speech';

const MAX_VOICE_OPTIONS = 8;

export interface VoiceOption {
  lang: string;
  name: string;
}

/**
 * Up to 8 voices to offer in the picker. The Web Speech API has no concept
 * of "downloadable" voice models — every voice comes from the browser/OS
 * already installed on the device — so this simply selects the best
 * distinct options actually available. Every option must be Brazilian
 * Portuguese specifically (pt-BR, not just any "pt-*" locale): pt-PT/pt-AO
 * voices read with a European accent, which is not the platform's standard,
 * so they're excluded rather than used as filler. There is no gender field
 * in the browser API — whichever pt-BR voices (male or female) the device
 * has installed are all offered, up to the cap. Returns fewer than 8 if the
 * device doesn't have that many pt-BR voices installed.
 */
export async function listVoiceOptions(): Promise<VoiceOption[]> {
  const voices = await getAvailableVoices();
  const brazilian = voices.filter((voice) => voice.lang.toLowerCase() === 'pt-br');

  const seen = new Set<string>();
  const options: VoiceOption[] = [];
  for (const voice of brazilian) {
    if (seen.has(voice.name)) continue;
    seen.add(voice.name);
    options.push({ lang: voice.lang, name: voice.name });
    if (options.length >= MAX_VOICE_OPTIONS) break;
  }
  return options;
}
