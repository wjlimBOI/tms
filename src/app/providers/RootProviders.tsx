'use client';

import { ThemeProvider } from './ThemeProvider';
import SessionProviderWrapper from './SessionProvider';
import QueryProvider from './QueryProvider';

interface RootProvidersProps {
  children: React.ReactNode;
  session: any;
}

export default function RootProviders({ children, session }: RootProvidersProps) {
  return (
    <ThemeProvider>
      <SessionProviderWrapper session={session}>
        <QueryProvider>{children}</QueryProvider>
      </SessionProviderWrapper>
    </ThemeProvider>
  );
}