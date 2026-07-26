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
 * distinct options actually available. Never falls back to a non-Portuguese
 * voice (that was the original bug: unrelated languages were used as
 * filler whenever the device had fewer than 4 Portuguese ones). Among
 * Portuguese voices, pt-BR (Brazilian accent, the platform's standard) is
 * always listed first; other Portuguese locales (pt-PT, pt-AO — European/
 * African accent) are still offered after them rather than dropped, because
 * many devices only expose one or two true pt-BR voices and hiding the
 * rest just shrinks the picker to almost nothing. There is no gender field
 * in the browser API — whichever voices (male or female) the device has
 * installed are all offered, up to the cap.
 */
export async function listVoiceOptions(): Promise<VoiceOption[]> {
  const voices = await getAvailableVoices();
  const isPortuguese = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().startsWith('pt');
  const isBrazilian = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase() === 'pt-br';
  const brazilian = voices.filter((voice) => isBrazilian(voice));
  const otherPortuguese = voices.filter((voice) => isPortuguese(voice) && !isBrazilian(voice));

  const seen = new Set<string>();
  const options: VoiceOption[] = [];
  for (const voice of [...brazilian, ...otherPortuguese]) {
    if (seen.has(voice.name)) continue;
    seen.add(voice.name);
    options.push({ lang: voice.lang, name: voice.name });
    if (options.length >= MAX_VOICE_OPTIONS) break;
  }
  return options;
}
