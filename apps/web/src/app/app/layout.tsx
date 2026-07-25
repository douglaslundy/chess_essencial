import type { ReactNode } from 'react';

import { AppChrome } from '@/components/navigation/app-chrome';
import { PieceThemeProvider } from '@/lib/piece-theme';
import { VoicePreferenceProvider } from '@/lib/voice-preference';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PieceThemeProvider>
      <VoicePreferenceProvider>
        <AppChrome>{children}</AppChrome>
      </VoicePreferenceProvider>
    </PieceThemeProvider>
  );
}
