// Web Speech API wrapper with fixes for two long-standing browser quirks:
// (1) some engines silently drop an utterance queued right after cancel()
//     in the same tick, so a pending cancel gets a short delay before the
//     next speak(); (2) a SpeechSynthesisUtterance with no surviving
//     reference can get garbage-collected mid-speech, cutting audio off —
//     keeping one module-level reference prevents that.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept alive on purpose, see above
let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, lang = 'pt-BR'): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  currentUtterance = utterance;
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(() => synth.speak(utterance), 50);
  } else {
    synth.speak(utterance);
  }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}
