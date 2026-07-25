import { getAvailableVoices } from './speech';

const MAX_VOICE_OPTIONS = 4;

export interface VoiceOption {
  lang: string;
  name: string;
}

/**
 * Up to 4 voices to offer in the picker. The Web Speech API has no concept
 * of "downloadable" voice models — every voice comes from the browser/OS
 * already installed on the device — so this simply selects the best
 * distinct options actually available: Portuguese voices first (any
 * pt-* locale), then whatever else exists if fewer than 4 Portuguese ones
 * are installed. Returns fewer than 4 if the device doesn't have that many.
 */
export async function listVoiceOptions(): Promise<VoiceOption[]> {
  const voices = await getAvailableVoices();
  const portuguese = voices.filter((voice) => voice.lang.toLowerCase().startsWith('pt'));
  const rest = voices.filter((voice) => !voice.lang.toLowerCase().startsWith('pt'));

  const seen = new Set<string>();
  const options: VoiceOption[] = [];
  for (const voice of [...portuguese, ...rest]) {
    if (seen.has(voice.name)) continue;
    seen.add(voice.name);
    options.push({ lang: voice.lang, name: voice.name });
    if (options.length >= MAX_VOICE_OPTIONS) break;
  }
  return options;
}
