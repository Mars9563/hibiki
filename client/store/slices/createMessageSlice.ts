// ============================================================
// store/slices/createMessagesSlice.ts
// Replaces features/chat/ui/useMessages.tsx.
//
// Design:
// - messagesByRoom: Map<roomId, RoomMessageState>
// - Each RoomMessageState.items is keyed by message.id, EXCEPT
//   while a message is pending, where it's keyed by clientTempId.
//   This means there is only ONE entry per logical message at any
//   time (the old code briefly had two: it never actually had a
//   collision bug here, but the dedupe logic was duplicated across
//   methods — now centralized in `mergeRealMessage`).
// - Pagination: loadInitialMessages fetches page 1 (newest 50).
//   loadMoreMessages fetches older messages using the stored
//   cursor (oldest loaded message's created_at). Both are no-ops
//   if already loading or hasMore is false.
// ============================================================
import type { StateCreator } from 'zustand';
import type {
  ChatRoom,
  MessageEntry,
  MessageStructure,
  RoomMessageState,
} from '@/lib/types';
import type { ChatStore } from '../chatStore';
import { toast } from 'sonner';
import { classifyMimeType, deriveMessageType } from '@/lib/attachments';
import type { Attachment } from '@/lib/types';

const PAGE_SIZE = 50;

function emptyRoomState(): RoomMessageState {
  return {
    items: new Map(),
    cursor: null,
    hasMore: true,
    isLoadingInitial: false,
    isLoadingMore: false,
    error: null,
  };
}

export type MessagesSlice = {
  messagesByRoom: Map<string, RoomMessageState>;
  uploadingAttachmentCount: number; // new

  loadInitialMessages: (roomId: string) => Promise<void>;
  loadMoreMessages: (roomId: string) => Promise<void>;
  sendMessage: (content: string, room: ChatRoom) => void;
  sendAttachmentMessage: (
    // new
    room: ChatRoom,
    files: File[],
    content: string
  ) => Promise<void>;
  mergeRealMessage: (
    message: MessageStructure,
    clientTempId?: string | null
  ) => void;
  markMessageFailed: (roomId: string, clientTempId: string) => void;
};

export const createMessagesSlice: StateCreator<
  ChatStore,
  [['zustand/immer', never]],
  [],
  MessagesSlice
> = (set, get) => ({
  messagesByRoom: new Map(),
  uploadingAttachmentCount: 0,

  loadInitialMessages: async (roomId) => {
    const current = get().messagesByRoom.get(roomId);
    if (current?.isLoadingInitial) return;

    set((state) => {
      const room = state.messagesByRoom.get(roomId) ?? emptyRoomState();
      room.isLoadingInitial = true;
      room.error = null;
      state.messagesByRoom.set(roomId, room);
    });

    try {
      const query = new URLSearchParams({
        roomId,
        limit: String(PAGE_SIZE),
      }).toString();

      const res = await fetch(`/api/messages?${query}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to load messages');

      const data = await res.json();
      if (!data.success)
        throw new Error(data.error || 'Failed to load messages');

      const messages: MessageStructure[] = data.messages ?? [];
      // Backend returns created_at DESC (newest first); store oldest-first
      // for natural render order, but keep the DESC list to compute the cursor.
      const oldest = messages[messages.length - 1];

      set((state) => {
        const room = emptyRoomState();
        messages
          .slice()
          .reverse()
          .forEach((message) => {
            room.items.set(message.id, {
              message,
              clientTempId: null,
              status: 'sent',
            });
          });
        room.cursor = oldest ? oldest.created_at : null;
        room.hasMore = messages.length === PAGE_SIZE;
        room.isLoadingInitial = false;
        state.messagesByRoom.set(roomId, room);
      });
    } catch (err) {
      set((state) => {
        const room = state.messagesByRoom.get(roomId) ?? emptyRoomState();
        room.isLoadingInitial = false;
        room.error =
          err instanceof Error ? err.message : 'Failed to load messages';
        state.messagesByRoom.set(roomId, room);
      });
    }
  },

  loadMoreMessages: async (roomId) => {
    const room = get().messagesByRoom.get(roomId);
    if (!room || room.isLoadingMore || !room.hasMore || !room.cursor) return;

    set((state) => {
      const r = state.messagesByRoom.get(roomId);
      if (r) r.isLoadingMore = true;
    });

    try {
      const query = new URLSearchParams({
        roomId,
        limit: String(PAGE_SIZE),
        before: room.cursor,
      }).toString();

      const res = await fetch(`/api/messages?${query}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to load older messages');

      const data = await res.json();
      if (!data.success)
        throw new Error(data.error || 'Failed to load older messages');

      const older: MessageStructure[] = data.messages ?? [];
      const oldest = older[older.length - 1];

      set((state) => {
        const r = state.messagesByRoom.get(roomId);
        if (!r) return;

        // Prepend older messages by rebuilding the map — Maps preserve
        // insertion order and there's no native "unshift", so we rebuild
        // once per page load (cheap: at most PAGE_SIZE items).
        const merged = new Map<string, MessageEntry>();
        older
          .slice()
          .reverse()
          .forEach((message) => {
            merged.set(message.id, {
              message,
              clientTempId: null,
              status: 'sent',
            });
          });
        r.items.forEach((entry, id) => merged.set(id, entry));

        r.items = merged;
        r.cursor = oldest ? oldest.created_at : r.cursor;
        r.hasMore = older.length === PAGE_SIZE;
        r.isLoadingMore = false;
      });
    } catch (err) {
      set((state) => {
        const r = state.messagesByRoom.get(roomId);
        if (!r) return;
        r.isLoadingMore = false;
        r.error =
          err instanceof Error ? err.message : 'Failed to load older messages';
      });
    }
  },

  sendMessage: (content, room) => {
    const clientTempId = `temp-${crypto.randomUUID()}`;
    const currentUserId = get().currentUser?.id ?? room.currentUserId;

    set((state) => {
      const r = state.messagesByRoom.get(room.roomId) ?? emptyRoomState();
      r.items.set(clientTempId, {
        message: {
          id: clientTempId,
          sender_id: currentUserId,
          room_id: room.roomId,
          created_at: new Date().toISOString(),
          content,
          message_type: 'text',
          attachments: [],
        },
        clientTempId,
        status: 'pending',
      });
      state.messagesByRoom.set(room.roomId, r);
    });

    get().socket?.emit('message:send', {
      room_id: room.roomId,
      content,
      clientTempId,
    });
  },
  // Sends via HTTP, not socket — files are big and sockets aren't
  // for binary. Reconciliation still goes through mergeRealMessage
  // with the same clientTempId, so it's a no-op if the socket's
  // message:new echo for this message arrives afterward (dedup
  // guard already inside mergeRealMessage handles that).
  sendAttachmentMessage: async (room, files, content) => {
    const clientTempId = `temp-${crypto.randomUUID()}`;
    const currentUserId = get().currentUser?.id ?? room.currentUserId;
    const trimmedContent = content.trim();

    // Local blob URLs so the sender sees their own image/file
    // immediately. Revoked once the real signed URLs take over (see
    // the success branch below) — left alone on failure so a
    // failed-to-send bubble still shows what was being sent.
    const optimisticAttachments: Attachment[] = files.map((file, i) => ({
      id: `local-${i}`,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      attachmentType: classifyMimeType(file.type),
      url: URL.createObjectURL(file),
    }));

    set((state) => {
      state.uploadingAttachmentCount += 1;
      const r = state.messagesByRoom.get(room.roomId) ?? emptyRoomState();
      r.items.set(clientTempId, {
        message: {
          id: clientTempId,
          sender_id: currentUserId,
          room_id: room.roomId,
          created_at: new Date().toISOString(),
          content: trimmedContent || null,
          message_type: deriveMessageType(optimisticAttachments),
          attachments: optimisticAttachments,
        },
        clientTempId,
        status: 'pending',
      });
      state.messagesByRoom.set(room.roomId, r);
    });

    try {
      const formData = new FormData();
      if (trimmedContent) formData.append('content', trimmedContent);
      formData.append('clientTempId', clientTempId);
      files.forEach((file) => formData.append('files', file));

      const res = await fetch(`/api/rooms/${room.roomId}/messages`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send');
      }

      get().mergeRealMessage(data.message, clientTempId);
      optimisticAttachments.forEach((a) => URL.revokeObjectURL(a.url));
    } catch (err) {
      get().markMessageFailed(room.roomId, clientTempId);
      toast.error(
        err instanceof Error ? err.message : 'Failed to send message'
      );
    } finally {
      set((state) => {
        state.uploadingAttachmentCount = Math.max(
          0,
          state.uploadingAttachmentCount - 1
        );
      });
    }
  },

  // Single dedupe path for "a real message arrived" — used by both
  // the socket `message:new` handler (with clientTempId) and any
  // future REST-confirmed send path (without one).
  mergeRealMessage: (message, clientTempId) =>
    set((state) => {
      const r = state.messagesByRoom.get(message.room_id) ?? emptyRoomState();

      if (clientTempId && r.items.has(clientTempId)) {
        r.items.delete(clientTempId);
      } else if (r.items.has(message.id)) {
        // Already merged (e.g. duplicate socket emit) — nothing to do.
        state.messagesByRoom.set(message.room_id, r);
        return;
      }

      const isMine = message.sender_id === state.currentUser?.id;
      r.items.set(message.id, {
        message,
        clientTempId: null,
        status: isMine ? 'sent' : 'received',
      });

      state.messagesByRoom.set(message.room_id, r);
    }),

  markMessageFailed: (roomId, clientTempId) =>
    set((state) => {
      const r = state.messagesByRoom.get(roomId);
      const entry = r?.items.get(clientTempId);
      if (entry) entry.status = 'failed';
    }),
});
