import type { ReactNode } from 'react';

import { AppChrome } from '@/components/navigation/app-chrome';
import { PieceThemeProvider } from '@/lib/piece-theme';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PieceThemeProvider>
      <AppChrome>{children}</AppChrome>
    </PieceThemeProvider>
  );
}
