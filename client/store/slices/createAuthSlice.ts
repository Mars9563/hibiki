// ============================================================
// store/slices/createAuthSlice.ts
// Replaces providers/user-provider.tsx (UserProvider/useUser context).
// ============================================================
import type { StateCreator } from 'zustand';
import type { Profile } from '@/lib/types';
import type { ChatStore } from '../chatStore';

export type AuthSlice = {
  currentUser: Profile | null;
  setCurrentUser: (user: Profile | null) => void;
};

export const createAuthSlice: StateCreator<
  ChatStore,
  [['zustand/immer', never]],
  [],
  AuthSlice
> = (set) => ({
  currentUser: null,

  setCurrentUser: (user) =>
    set((state) => {
      state.currentUser = user;
    }),
});
