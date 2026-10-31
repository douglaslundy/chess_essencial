import type { ReactNode } from 'react';

import { AppChrome } from '@/components/navigation/app-chrome';
import { BoardModeProvider } from '@/lib/board-mode';
import { PieceThemeProvider } from '@/lib/piece-theme';
import { VoicePreferenceProvider } from '@/lib/voice-preference';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PieceThemeProvider>
      <VoicePreferenceProvider>
        <BoardModeProvider>
          <AppChrome>{children}</AppChrome>
        </BoardModeProvider>
      </VoicePreferenceProvider>
    </PieceThemeProvider>
  );
}
