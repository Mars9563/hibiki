// ============================================================
// store/slices/createFriendshipsSlice.ts
// Replaces features/chat/requests/useRequests.ts (all 5 React
// Query hooks: search, send, pending, accept, reject).
// ============================================================
import type { StateCreator } from 'zustand';
import type { PendingFriendship, SearchUser } from '@/lib/types';
import type { ChatStore } from '../chatStore';

export type FriendshipsSlice = {
  searchQuery: string;
  searchResults: SearchUser[];
  searchStatus: 'idle' | 'loading' | 'error' | 'success';
  searchError: string | null;

  sentPending: PendingFriendship[];
  receivedPending: PendingFriendship[];
  pendingStatus: 'idle' | 'loading' | 'error' | 'success';
  pendingError: string | null;

  sendingRequestTo: Set<string>; // userIds currently being requested
  acceptingRequestFrom: Set<string>;
  rejectingRequestFrom: Set<string>;

  searchUsers: (query: string) => Promise<void>;
  sendFriendRequest: (targetUserId: string) => Promise<void>;
  fetchPendingRequests: () => Promise<void>;
  acceptFriendRequest: (requesterId: string) => Promise<void>;
  rejectFriendRequest: (requesterId: string) => Promise<void>;
};

export const createFriendshipsSlice: StateCreator<
  ChatStore,
  [['zustand/immer', never]],
  [],
  FriendshipsSlice
> = (set, get) => ({
  searchQuery: '',
  searchResults: [],
  searchStatus: 'idle',
  searchError: null,

  sentPending: [],
  receivedPending: [],
  pendingStatus: 'idle',
  pendingError: null,

  sendingRequestTo: new Set(),
  acceptingRequestFrom: new Set(),
  rejectingRequestFrom: new Set(),

  searchUsers: async (query) => {
    set((state) => {
      state.searchQuery = query;
    });

    if (query.length < 2) {
      set((state) => {
        state.searchResults = [];
        state.searchStatus = 'idle';
      });
      return;
    }

    set((state) => {
      state.searchStatus = 'loading';
      state.searchError = null;
    });

    try {
      const res = await fetch(
        `/api/friendships/search?q=${encodeURIComponent(query)}`,
        { method: 'GET', credentials: 'include' }
      );

      if (!res.ok) throw new Error('Failed to search users');

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Search failed');

      set((state) => {
        // Guard against a stale slow response clobbering a newer query.
        if (state.searchQuery !== query) return;
        state.searchResults = data.results;
        state.searchStatus = 'success';
      });
    } catch (err) {
      set((state) => {
        state.searchStatus = 'error';
        state.searchError =
          err instanceof Error ? err.message : 'Search failed';
      });
    }
  },

  sendFriendRequest: async (targetUserId) => {
    set((state) => {
      state.sendingRequestTo.add(targetUserId);
    });

    try {
      const res = await fetch('/api/friendships/request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });

      if (!res.ok) throw new Error('Failed to send request');

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Request failed');

      set((state) => {
        state.searchResults = state.searchResults.filter(
          (u) => u.id !== targetUserId
        );
        state.sendingRequestTo.delete(targetUserId);

        // Push the new request straight into sentPending so it shows
        // up immediately, no refetch/page reload needed. Falls back
        // to a refetch if the backend didn't send the row back (e.g.
        // an older deployed API), so this never silently no-ops.
        if (data.friendship) {
          state.sentPending.unshift(data.friendship);
        }
      });

      if (!data.friendship) {
        get().fetchPendingRequests();
      }
    } catch (err) {
      set((state) => {
        state.sendingRequestTo.delete(targetUserId);
      });
      throw err; // let the caller toast it
    }
  },

  fetchPendingRequests: async () => {
    set((state) => {
      state.pendingStatus = 'loading';
      state.pendingError = null;
    });

    try {
      const res = await fetch('/api/friendships/pending', {
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to fetch pending requests');

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Pending fetch failed');

      set((state) => {
        state.sentPending = data.sentPending;
        state.receivedPending = data.recievedPending; // backend typo preserved at the boundary only
        state.pendingStatus = 'success';
      });
    } catch (err) {
      set((state) => {
        state.pendingStatus = 'error';
        state.pendingError =
          err instanceof Error ? err.message : 'Failed to load requests';
      });
    }
  },

  acceptFriendRequest: async (requesterId) => {
    set((state) => {
      state.acceptingRequestFrom.add(requesterId);
    });

    try {
      const res = await fetch('/api/friendships/accept', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: requesterId }),
      });

      if (!res.ok) throw new Error('Failed to accept request');

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Accept failed');

      set((state) => {
        state.receivedPending = state.receivedPending.filter(
          (r) => r.requester.id !== requesterId
        );
        state.acceptingRequestFrom.delete(requesterId);
      });

      // Bug fix: this used to invalidate ['rooms'] (wrong key) while the
      // actual cache lived under ['directRooms']. Now we just refetch the
      // single correct source directly.
      get().fetchRooms();
    } catch (err) {
      set((state) => {
        state.acceptingRequestFrom.delete(requesterId);
      });
      throw err;
    }
  },

  rejectFriendRequest: async (requesterId) => {
    set((state) => {
      state.rejectingRequestFrom.add(requesterId);
    });

    try {
      const res = await fetch('/api/friendships/reject', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: requesterId }),
      });

      if (!res.ok) throw new Error('Failed to reject request');

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Reject failed');

      set((state) => {
        state.receivedPending = state.receivedPending.filter(
          (r) => r.requester.id !== requesterId
        );
        state.rejectingRequestFrom.delete(requesterId);
      });
    } catch (err) {
      set((state) => {
        state.rejectingRequestFrom.delete(requesterId);
      });
      throw err;
    }
  },
});
