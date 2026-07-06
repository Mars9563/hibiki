// ============================================================
// store/slices/createSocketSlice.ts
// Replaces features/chat/socket/useChatSocketSync.ts AND
// features/chat/socket/ChatSocketSync.tsx entirely.
//
// The store now owns the socket instance and every listener.
// Call connectSocket(token) once after auth resolves (e.g. in a
// small client component mounted at the app root) and
// disconnectSocket() on logout. Components never touch `socket`
// directly — they call store actions, which emit internally.
// ============================================================
import type { StateCreator } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type { ChatRoom, GroupChatRoom, MessageStructure } from '@/lib/types';
import type { ChatStore } from '../chatStore';
import { toast } from 'sonner';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:5000';

export type SocketSlice = {
  socket: Socket | null;
  isSocketConnected: boolean;

  connectSocket: (token: string) => void;
  disconnectSocket: () => void;
  joinRoom: (roomId: string) => void;
  joinManyRooms: (roomIds: string[]) => void;
};

export const createSocketSlice: StateCreator<
  ChatStore,
  [['zustand/immer', never]],
  [],
  SocketSlice
> = (set, get) => ({
  socket: null,
  isSocketConnected: false,

  connectSocket: (token) => {
    // Avoid double-connecting on hot reload / repeated mount.
    if (get().socket) return;

    const socket = io(SOCKET_URL, {
      autoConnect: false,
      withCredentials: true,
      auth: { token },
    });

    socket.on('connect', () => {
      set((state) => {
        state.isSocketConnected = true;
      });
    });

    socket.on('disconnect', () => {
      set((state) => {
        state.isSocketConnected = false;
      });
    });

    // ---- messages ----
    socket.on(
      'message:new',
      (data: { message: MessageStructure; clientTempId: string }) => {
        get().mergeRealMessage(data.message, data.clientTempId);
      }
    );

    socket.on(
      'message:error',
      (data: { error: string; clientTempId?: string }) => {
        toast.error(data.error || 'Failed to send message');
        if (data.clientTempId) {
          const roomId = findRoomForClientTempId(get(), data.clientTempId);
          if (roomId) get().markMessageFailed(roomId, data.clientTempId);
        }
      }
    );

    // ---- room join feedback ----
    socket.on('room:joined', () => {
      // Intentionally quiet in production; flip on for debugging.
    });

    socket.on('room:unauthorized', (data: { error: string }) => {
      toast.error(data.error);
    });

    socket.on('room:error', (data: { error: string }) => {
      toast.error(data.error);
    });

    // ---- friendship events ----
    socket.on('friendship:got_a_request', () => {
      get().fetchPendingRequests();
      toast.info('New friend request received');
    });

    socket.on('friendship:accepted', () => {
      get().fetchRooms();
      get().fetchPendingRequests();
      toast.success('Friend request accepted');
    });

    socket.on('friendship:rejected', () => {
      toast.info('Your friend request was declined');
    });

    // ---- group events ----
    socket.on(
      'group:invited',
      (data: {
        roomId: string;
        roomName?: string;
        inviterId: string;
        inviteId: string;
      }) => {
        get().fetchPendingGroupInvites();
        toast.info(
          `New group invite${data.roomName ? `: ${data.roomName}` : ''}`
        );
      }
    );

    socket.on('group:joined', (data: { room: GroupChatRoom }) => {
      get().upsertRoom(data.room);
      get().joinRoom(data.room.roomId);
      toast.success(`You joined ${data.room.name}`);
    });

    socket.on('group:memberJoined', () => {
      get().fetchRooms();
    });

    // A group's name/description/avatar or a member's role changed.
    // The enriched room is built from the acting admin's perspective,
    // so each receiver rewrites the per-viewer fields (currentUserId /
    // currentUserRole) to their own before upserting.
    socket.on('room:updated', (data: { room: ChatRoom }) => {
      const myId = get().currentUser?.id;
      if (!myId) return;

      const room = data.room;
      if (room.roomType === 'group') {
        const me = room.members.find((m) => m.id === myId);
        // Not (or no longer) a member — ignore rather than store a room
        // we shouldn't see.
        if (!me) return;
        get().upsertRoom({
          ...room,
          currentUserId: myId,
          currentUserRole: me.role,
        });
      } else {
        get().upsertRoom({ ...room, currentUserId: myId });
      }
    });

    socket.connect();

    // IMPORTANT: don't assign the live Socket instance inside an
    // Immer draft mutator. Immer tries to recursively wrap it in a
    // WritableDraft, and Socket has internal readonly array fields
    // (e.g. receiveBuffer) that TypeScript can't reconcile with that
    // draft type — this fails the build with a type error, even
    // though nothing about it is actually a logic bug. Passing a
    // plain object here (Zustand's "replacer" call signature) stores
    // the socket as-is, untouched by Immer's draft proxy.
    set({ socket });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();

    // Same reasoning as above: assign `socket: null` via the plain
    // replacer form, only flip the boolean through the normal draft.
    set({ socket: null });
    set((state) => {
      state.isSocketConnected = false;
    });
  },

  joinRoom: (roomId) => {
    get().socket?.emit('room:join', { roomId });
  },

  joinManyRooms: (roomIds) => {
    get().socket?.emit('rooms:joinMany', { roomIds });
  },
});

// A pending message is keyed by clientTempId inside exactly one room's
// item map. We don't track a reverse index for this (failures are rare
// enough that an O(rooms) scan on failure is fine) — see optimization
// notes if this ever needs to be O(1).
function findRoomForClientTempId(
  state: ChatStore,
  clientTempId: string
): string | null {
  for (const [roomId, roomState] of state.messagesByRoom) {
    if (roomState.items.has(clientTempId)) return roomId;
  }
  return null;
}
