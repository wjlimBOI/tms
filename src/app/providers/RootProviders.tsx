'use client';

import SessionProviderWrapper from './SessionProvider';
import QueryProvider from './QueryProvider';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { NotificationProvider } from '@/components/ui/notification-provider';

interface RootProvidersProps {
  children: React.ReactNode;
  session: any;
}

export default function RootProviders({ children, session }: RootProvidersProps) {
  return (
    <SessionProviderWrapper session={session}>
      <QueryProvider>
        <NotificationProvider>
          <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
        </NotificationProvider>
      </QueryProvider>
    </SessionProviderWrapper>
  );
}
