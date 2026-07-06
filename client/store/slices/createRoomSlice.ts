// ============================================================
// store/slices/createRoomsSlice.ts
// Replaces features/chat/rooms/useRooms.ts and the React Query
// ['directRooms'] cache entirely.
//
// Bug fix: every place that used to invalidate ['rooms'] (wrong
// key) or ['directRooms'] (right key, but via queryClient) now
// just calls fetchRooms() or mutates roomsById directly when we
// already have the data from a socket event (no need to refetch).
// ============================================================
import type { StateCreator } from 'zustand';
import type { ChatRoom } from '@/lib/types';
import type { ChatStore } from '../chatStore';

export type RoomsSlice = {
  roomsById: Map<string, ChatRoom>;
  roomOrder: string[]; // preserves list order without re-sorting a Map
  roomsStatus: 'idle' | 'loading' | 'error' | 'success';
  roomsError: string | null;

  fetchRooms: () => Promise<void>;
  upsertRoom: (room: ChatRoom) => void;
  removeRoom: (roomId: string) => void;
};

export const createRoomsSlice: StateCreator<
  ChatStore,
  [['zustand/immer', never]],
  [],
  RoomsSlice
> = (set, get) => ({
  roomsById: new Map(),
  roomOrder: [],
  roomsStatus: 'idle',
  roomsError: null,

  fetchRooms: async () => {
    set((state) => {
      state.roomsStatus = 'loading';
      state.roomsError = null;
    });

    try {
      const res = await fetch('/api/rooms', {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to fetch rooms');

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Backend error');

      const rooms: ChatRoom[] = data.rooms ?? [];

      set((state) => {
        state.roomsById = new Map(rooms.map((r) => [r.roomId, r]));
        state.roomOrder = rooms.map((r) => r.roomId);
        state.roomsStatus = 'success';
      });

      // Join all rooms over the socket in one shot (replaces the
      // useEffect inside the old useRooms hook).
      const roomIds = rooms.map((r) => r.roomId);
      if (roomIds.length > 0) {
        get().joinManyRooms(roomIds);
      }
    } catch (err) {
      set((state) => {
        state.roomsStatus = 'error';
        state.roomsError =
          err instanceof Error ? err.message : 'Failed to load chats';
      });
    }
  },

  upsertRoom: (room) =>
    set((state) => {
      const isNew = !state.roomsById.has(room.roomId);
      state.roomsById.set(room.roomId, room);
      if (isNew) {
        state.roomOrder.unshift(room.roomId); // newest room first
      }
    }),

  removeRoom: (roomId) =>
    set((state) => {
      state.roomsById.delete(roomId);
      state.roomOrder = state.roomOrder.filter((id) => id !== roomId);
    }),
});
