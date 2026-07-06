// ============================================================
// store/chatStore.ts
// THE single source of truth. Combines every slice. This file
// replaces:
//   - providers/user-provider.tsx
//   - features/chat/context/chat-ui-context.tsx
//   - features/chat/rooms/useRooms.ts
//   - features/chat/ui/useMessages.tsx
//   - features/chat/requests/useRequests.ts
//   - features/chat/socket/useChatSocketSync.ts
//   - features/chat/socket/ChatSocketSync.tsx
//   - providers/query-provider.tsx / providers/socket-provider.tsx
//     (no longer needed at all — see migration notes)
// ============================================================
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';
import { enableMapSet } from 'immer';

import {
  createAuthSlice,
  type AuthSlice,
} from '@/store/slices/createAuthSlice';
import { createUiSlice, type UiSlice } from '@/store/slices/createUiSlice';
import {
  createRoomsSlice,
  type RoomsSlice,
} from '@/store/slices/createRoomSlice';
import {
  createMessagesSlice,
  type MessagesSlice,
} from '@/store/slices/createMessageSlice';
import {
  createFriendshipsSlice,
  type FriendshipsSlice,
} from '@/store/slices/createFriendshipSlice';
import {
  createSocketSlice,
  type SocketSlice,
} from '@/store/slices/createSocketSlice';
import {
  createGroupSlice,
  type GroupSlice,
} from '@/store/slices/createGroupSlice';
import {
  createComposerSlice,
  type ComposerSlice,
} from '@/store/slices/createComposerSlice';

// REQUIRED: every slice mutates native Map/Set instances inside
// immer drafts (roomsById, messagesByRoom, sendingRequestTo, etc).
// Without this call, the very first such mutation throws at runtime:
// "[Immer] The plugin for 'MapSet' has not been loaded into Immer."
enableMapSet();

export type ChatStore = AuthSlice &
  UiSlice &
  RoomsSlice &
  MessagesSlice &
  FriendshipsSlice &
  SocketSlice &
  GroupSlice &
  ComposerSlice;

export const useChatStore = create<ChatStore>()(
  devtools(
    immer((...a) => ({
      ...createAuthSlice(...a),
      ...createUiSlice(...a),
      ...createRoomsSlice(...a),
      ...createMessagesSlice(...a),
      ...createFriendshipsSlice(...a),
      ...createSocketSlice(...a),
      ...createGroupSlice(...a),
      ...createComposerSlice(...a),
    })),
    { name: 'hibiki-chat-store' }
  )
);
