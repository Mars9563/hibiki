// ============================================================
// store/slices/createUiSlice.ts
// Replaces features/chat/context/chat-ui-context.tsx entirely.
//
// IMPORTANT: selectedRoomId is the source of truth (not the full
// room object). The full room is derived via a selector from
// rooms.byId — this avoids two copies of the same room object
// drifting out of sync (the old bug class where Context held a
// stale `selectedRoom` after the room list refetched).
// ============================================================
import type { StateCreator } from 'zustand';
import type { ViewMode } from '@/lib/types';
import type { ChatStore } from '../chatStore';

export type UiSlice = {
  viewMode: ViewMode;
  selectedRoomId: string | null;
  sidePanelOpen: boolean;
  mobileSidebarOpen: boolean; // new

  setViewMode: (mode: ViewMode) => void;
  selectRoom: (roomId: string | null) => void;
  setSidePanelOpen: (command: boolean) => void;
  setMobileSidebarOpen: (command: boolean) => void; // new
};

export const createUiSlice: StateCreator<
  ChatStore,
  [['zustand/immer', never]],
  [],
  UiSlice
> = (set, get) => ({
  viewMode: 'rooms',
  selectedRoomId: null,
  sidePanelOpen: false,
  mobileSidebarOpen: false,

  setViewMode: (mode) =>
    set((state) => {
      state.viewMode = mode;
    }),

  selectRoom: (roomId) => {
    // Switching away from a room drops anything staged but unsent —
    // staged files belong to the conversation you were composing in.
    if (get().selectedRoomId !== roomId) get().clearStagedFiles();

    set((state) => {
      state.selectedRoomId = roomId;
    });

    if (!roomId) return;

    // Join the socket room for live messages.
    get().joinRoom(roomId);

    // Auto-fetch page 1 if we haven't loaded this room's messages yet.
    const existing = get().messagesByRoom.get(roomId);
    if (!existing) {
      get().loadInitialMessages(roomId);
    }
  },
  setSidePanelOpen: (command: boolean) => {
    set((state) => {
      state.sidePanelOpen = command;
    });
  },
  setMobileSidebarOpen: (command: boolean) => {
    set((state) => {
      state.mobileSidebarOpen = command;
    });
  },
});
