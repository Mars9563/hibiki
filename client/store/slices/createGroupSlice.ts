// ============================================================
// store/slices/createGroupSlice.ts
// Group-specific actions: create, invite, fetch/accept/reject
// pending invites. Group *rooms* themselves still live in
// roomsById (RoomsSlice) — this slice only owns the invite
// lifecycle, same separation as friendships (FriendshipsSlice)
// vs rooms (RoomsSlice) for direct chats.
// ============================================================
import type { StateCreator } from 'zustand';
import type { ChatStore } from '../chatStore';
import type { ChatRoom, PendingGroupInvite, PendingGroupInviteWithRoster, SearchUser } from '@/lib/types';

export type GroupSlice = {
  pendingGroupInvites: PendingGroupInvite[];
  groupInvitesStatus: 'idle' | 'loading' | 'error' | 'success';
  groupInvitesError: string | null;

  creatingGroup: boolean;
  invitingToGroup: Set<string>; // composite "roomId:inviteeId" keys in flight
  acceptingGroupInvite: Set<string>; // inviteIds in flight
  rejectingGroupInvite: Set<string>;

  groupSearchQuery: string;
  groupSearchResults: SearchUser[];
  groupSearchStatus: 'idle' | 'loading' | 'error' | 'success';
  groupSearchError: string | null;

  draftGroupName: string;
  draftMembers: Map<string, SearchUser>; // userId -> profile, preserves what was selected

  searchUsersForGroup: (query: string) => Promise<void>;
  setDraftGroupName: (name: string) => void;
  addDraftMember: (user: SearchUser) => void;
  removeDraftMember: (userId: string) => void;
  resetGroupDraft: () => void;

  createGroup: (name: string, inviteeIds: string[]) => Promise<void>;
  inviteToGroup: (roomId: string, inviteeId: string) => Promise<void>;
  fetchPendingGroupInvites: () => Promise<void>;
  acceptGroupInvite: (inviteId: string) => Promise<void>;
  rejectGroupInvite: (inviteId: string) => Promise<void>;

  // Group management from the room panel (admin-only, enforced
  // server-side). Both upsert the returned enriched room, so the open
  // panel reflects the change immediately for the acting admin.
  updatingGroup: boolean;
  promotingMember: Set<string>; // "roomId:userId" keys in flight
  updateGroup: (
    roomId: string,
    fields: { name?: string; description?: string; avatar?: Blob }
  ) => Promise<void>;
  promoteGroupMember: (roomId: string, userId: string) => Promise<void>;

  groupInvites: PendingGroupInviteWithRoster[];
  selectedGroupInviteId: string | null;

  acceptingInviteId: string | null;
  rejectingInviteId: string | null;

  fetchGroupInvites: () => Promise<void>;
  selectGroupInvite: (inviteId: string | null) => void;
  acceptGroupInviteAction: (inviteId: string) => Promise<void>;
  rejectGroupInviteAction: (inviteId: string) => Promise<void>;
};

export const createGroupSlice: StateCreator<
  ChatStore,
  [['zustand/immer', never]],
  [],
  GroupSlice
> = (set, get) => ({
  pendingGroupInvites: [],
  groupInvitesStatus: 'idle',
  groupInvitesError: null,

  creatingGroup: false,
  invitingToGroup: new Set(),
  acceptingGroupInvite: new Set(),
  rejectingGroupInvite: new Set(),

  updatingGroup: false,
  promotingMember: new Set(),

  createGroup: async (name, inviteeIds) => {
    set((state) => {
      state.creatingGroup = true;
    });

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, inviteeIds }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create group');
      }

      // The backend now returns the fully-enriched room shape directly
      // (roomId/roomType/members[]/etc — same contract as GET /rooms),
      // so no shape translation is needed here.
      const room: ChatRoom = data.room;
      get().upsertRoom(room);
      get().joinRoom(room.roomId);

      set((state) => {
        state.creatingGroup = false;
      });
    } catch (err) {
      set((state) => {
        state.creatingGroup = false;
      });
      throw err; // let the caller toast it
    }
  },

  inviteToGroup: async (roomId, inviteeId) => {
    const key = `${roomId}:${inviteeId}`;
    set((state) => {
      state.invitingToGroup.add(key);
    });

    try {
      const res = await fetch(`/api/groups/${roomId}/invites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to send invite');
      }

      set((state) => {
        state.invitingToGroup.delete(key);
      });
    } catch (err) {
      set((state) => {
        state.invitingToGroup.delete(key);
      });
      throw err;
    }
  },

  updateGroup: async (roomId, fields) => {
    set((state) => {
      state.updatingGroup = true;
    });

    try {
      const form = new FormData();
      if (fields.name !== undefined) form.append('name', fields.name);
      if (fields.description !== undefined) {
        form.append('description', fields.description);
      }
      if (fields.avatar) form.append('avatar', fields.avatar);

      const res = await fetch(`/api/groups/${roomId}`, {
        method: 'PATCH',
        credentials: 'include',
        body: form,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update group');
      }

      get().upsertRoom(data.room);

      set((state) => {
        state.updatingGroup = false;
      });
    } catch (err) {
      set((state) => {
        state.updatingGroup = false;
      });
      throw err;
    }
  },

  promoteGroupMember: async (roomId, userId) => {
    const key = `${roomId}:${userId}`;
    set((state) => {
      state.promotingMember.add(key);
    });

    try {
      const res = await fetch(`/api/groups/${roomId}/participants/${userId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to promote member');
      }

      get().upsertRoom(data.room);

      set((state) => {
        state.promotingMember.delete(key);
      });
    } catch (err) {
      set((state) => {
        state.promotingMember.delete(key);
      });
      throw err;
    }
  },

  fetchPendingGroupInvites: async () => {
    set((state) => {
      state.groupInvitesStatus = 'loading';
      state.groupInvitesError = null;
    });

    try {
      const res = await fetch('/api/groups/invites/pending', {
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to fetch group invites');

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Fetch failed');

      set((state) => {
        state.pendingGroupInvites = data.pending;
        state.groupInvitesStatus = 'success';
      });
    } catch (err) {
      set((state) => {
        state.groupInvitesStatus = 'error';
        state.groupInvitesError =
          err instanceof Error ? err.message : 'Failed to load invites';
      });
    }
  },

  acceptGroupInvite: async (inviteId) => {
    set((state) => {
      state.acceptingGroupInvite.add(inviteId);
    });

    try {
      const res = await fetch('/api/groups/invites/accept', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to accept invite');
      }

      set((state) => {
        state.pendingGroupInvites = state.pendingGroupInvites.filter(
          (inv) => inv.id !== inviteId
        );
        state.acceptingGroupInvite.delete(inviteId);
      });

      // The backend returns the fully-enriched room shape now (see
      // getEnrichedGroupRoom in room.service.ts) — same contract as
      // GET /api/rooms — so we can upsert directly with no refetch.
      const room: ChatRoom = data.room;
      get().upsertRoom(room);
      get().joinRoom(room.roomId);
    } catch (err) {
      set((state) => {
        state.acceptingGroupInvite.delete(inviteId);
      });
      throw err;
    }
  },

  rejectGroupInvite: async (inviteId) => {
    set((state) => {
      state.rejectingGroupInvite.add(inviteId);
    });

    try {
      const res = await fetch('/api/groups/invites/reject', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to reject invite');
      }

      set((state) => {
        state.pendingGroupInvites = state.pendingGroupInvites.filter(
          (inv) => inv.id !== inviteId
        );
        state.rejectingGroupInvite.delete(inviteId);
      });
    } catch (err) {
      set((state) => {
        state.rejectingGroupInvite.delete(inviteId);
      });
      throw err;
    }
  },

  groupSearchQuery: '',
  groupSearchResults: [],
  groupSearchStatus: 'idle',
  groupSearchError: null,

  draftGroupName: '',
  draftMembers: new Map(),

  searchUsersForGroup: async (query) => {
    set((state) => {
      state.groupSearchQuery = query;
    });

    if (query.length < 2) {
      set((state) => {
        state.groupSearchResults = [];
        state.groupSearchStatus = 'idle';
      });
      return;
    }

    set((state) => {
      state.groupSearchStatus = 'loading';
      state.groupSearchError = null;
    });

    try {
      const res = await fetch(
        `/api/groups/search?q=${encodeURIComponent(query)}`,
        { method: 'GET', credentials: 'include' }
      );

      if (!res.ok) throw new Error('Failed to search users');

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Search failed');

      set((state) => {
        if (state.groupSearchQuery !== query) return; // stale response guard
        state.groupSearchResults = data.results;
        state.groupSearchStatus = 'success';
      });
    } catch (err) {
      set((state) => {
        state.groupSearchStatus = 'error';
        state.groupSearchError =
          err instanceof Error ? err.message : 'Search failed';
      });
    }
  },

  setDraftGroupName: (name) =>
    set((state) => {
      state.draftGroupName = name;
    }),

  addDraftMember: (user) =>
    set((state) => {
      state.draftMembers.set(user.id, user);
    }),

  removeDraftMember: (userId) =>
    set((state) => {
      state.draftMembers.delete(userId);
    }),

  resetGroupDraft: () =>
    set((state) => {
      state.draftGroupName = '';
      state.draftMembers = new Map();
      state.groupSearchQuery = '';
      state.groupSearchResults = [];
      state.groupSearchStatus = 'idle';
    }),
  groupInvites: [],
  selectedGroupInviteId: null,

  acceptingInviteId: null,
  rejectingInviteId: null,

  fetchGroupInvites: async () => {
    set((state) => {
      state.groupInvitesStatus = 'loading';
      state.groupInvitesError = null;
    });

    try {
      const res = await fetch('/api/groups/invites/pending', {
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load group invites');
      }

      set((state) => {
        state.groupInvites = data.pending;
        state.groupInvitesStatus = 'success';
      });
    } catch (err) {
      set((state) => {
        state.groupInvitesStatus = 'error';
        state.groupInvitesError =
          err instanceof Error ? err.message : 'Failed to load invites';
      });
    }
  },

  selectGroupInvite: (inviteId) =>
    set((state) => {
      state.selectedGroupInviteId = inviteId;
    }),

  acceptGroupInviteAction: async (inviteId) => {
    set((state) => {
      state.acceptingInviteId = inviteId;
    });

    try {
      const res = await fetch('/api/groups/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to accept invite');
      }

      get().upsertRoom(data.room);

      set((state) => {
        state.groupInvites = state.groupInvites.filter(
          (inv) => inv.id !== inviteId
        );
        if (state.selectedGroupInviteId === inviteId) {
          state.selectedGroupInviteId = null;
        }
        state.acceptingInviteId = null;
      });
    } catch (err) {
      set((state) => {
        state.acceptingInviteId = null;
      });
      throw err;
    }
  },

  rejectGroupInviteAction: async (inviteId) => {
    set((state) => {
      state.rejectingInviteId = inviteId;
    });

    try {
      const res = await fetch('/api/groups/invites/reject', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reject invite');
      }

      // Per spec: rejecting clears the right pane immediately if that
      // invite's roster was the one being shown.
      set((state) => {
        state.groupInvites = state.groupInvites.filter(
          (inv) => inv.id !== inviteId
        );
        if (state.selectedGroupInviteId === inviteId) {
          state.selectedGroupInviteId = null;
        }
        state.rejectingInviteId = null;
      });
    } catch (err) {
      set((state) => {
        state.rejectingInviteId = null;
      });
      throw err;
    }
  },
});