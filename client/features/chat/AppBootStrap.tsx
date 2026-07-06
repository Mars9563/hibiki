'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useChatStore } from '@/store/chatStore';
import type { Profile } from '@/lib/types';
import { LoadingScreen } from './layout/LoadingScreen';

export function AppBootstrap({
  initialUser,
  children,
}: {
  initialUser: Profile | null;
  children: ReactNode;
}) {
  const didInit = useRef(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const store = useChatStore.getState();
    store.setCurrentUser(initialUser);

    async function bootstrap() {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      // Phase 1: rooms + pending requests/invites. Everything after
      // this depends on knowing which rooms exist.
      await Promise.allSettled([
        useChatStore.getState().fetchRooms(),
        useChatStore.getState().fetchPendingRequests(),
        useChatStore.getState().fetchPendingGroupInvites(),
      ]);

      // Phase 2: preload recent messages for every room so opening
      // any chat afterward doesn't trigger its own fetch.
      const roomIds = useChatStore.getState().roomOrder;
      await Promise.allSettled(
        roomIds.map((id) => useChatStore.getState().loadInitialMessages(id))
      );

      // Phase 3: socket connects last, once everything needed to
      // render the app is already in the store.
      if (token) {
        useChatStore.getState().connectSocket(token);
        useChatStore.getState().joinManyRooms(roomIds);
      }

      setIsReady(true);
    }

    bootstrap();

    return () => {
      useChatStore.getState().disconnectSocket();
    };
  }, [initialUser]);

  if (!isReady) {
    return <LoadingScreen/>;
  }

  return <>{children}</>;
}
