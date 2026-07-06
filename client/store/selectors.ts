// ============================================================
// store/selectors.ts
// Components should import FROM HERE, not call useChatStore()
// directly with no selector. A bare `useChatStore()` subscribes
// to the entire store and re-renders on every single action in
// the app — that's the #1 way a Zustand migration ends up worse
// than the React Query setup it replaced.
//
// Rule of thumb encoded below: every hook here returns the
// smallest possible slice, and any hook returning an
// object/array uses useShallow so referentially-new-but-
// shallow-equal results don't trigger a re-render.
// ============================================================
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from './chatStore';
import type { ChatRoom, MessageEntry, SearchUser } from '@/lib/types';

// ---------- Auth ----------

export const useCurrentUser = () => useChatStore((s) => s.currentUser);

// ---------- UI ----------

export const useViewMode = () => useChatStore((s) => s.viewMode);
export const useSetViewMode = () => useChatStore((s) => s.setViewMode);
export const useSelectRoom = () => useChatStore((s) => s.selectRoom);
export const useSidePanelOpen = () => useChatStore((s) => s.sidePanelOpen);
export const useSetSidePanelOpen = () =>
  useChatStore((s) => s.setSidePanelOpen);
export const useMobileSidebarOpen = () =>
  useChatStore((s) => s.mobileSidebarOpen);
export const useSetMobileSidebarOpen = () =>
  useChatStore((s) => s.setMobileSidebarOpen);

export const useSelectedRoom = (): ChatRoom | null =>
  useChatStore((s) =>
    s.selectedRoomId ? (s.roomsById.get(s.selectedRoomId) ?? null) : null
  );

// ---------- Rooms ----------

export const useRoomsList = (): ChatRoom[] =>
  useChatStore(
    useShallow((s) =>
      s.roomOrder.map((id) => s.roomsById.get(id)!).filter(Boolean)
    )
  );

export const useRoomsStatus = () =>
  useChatStore(
    useShallow((s) => ({ status: s.roomsStatus, error: s.roomsError }))
  );

export const useFetchRooms = () => useChatStore((s) => s.fetchRooms);

// ---------- Messages ----------

// Returns a sorted array for a single room. Sorting happens here
// (not stored pre-sorted) because Map insertion order is already
// chronological from how the slice builds it — see note in
// createMessagesSlice. If that invariant ever breaks, sort by
// message.created_at here instead of trusting insertion order.
export const useMessagesForRoom = (roomId: string | null): MessageEntry[] =>
  useChatStore(
    useShallow((s) => {
      if (!roomId) return [];
      const room = s.messagesByRoom.get(roomId);
      if (!room) return [];
      return Array.from(room.items.values());
    })
  );

export const useRoomMessageMeta = (roomId: string | null) =>
  useChatStore(
    useShallow((s) => {
      const empty = {
        hasMore: false,
        isLoadingInitial: false,
        isLoadingMore: false,
        error: null as string | null,
      };
      if (!roomId) return empty;
      const room = s.messagesByRoom.get(roomId);
      if (!room) return empty;
      return {
        hasMore: room.hasMore,
        isLoadingInitial: room.isLoadingInitial,
        isLoadingMore: room.isLoadingMore,
        error: room.error,
      };
    })
  );

export const useSendMessage = () => useChatStore((s) => s.sendMessage);
export const useLoadMoreMessages = () =>
  useChatStore((s) => s.loadMoreMessages);

export const useSendAttachmentMessage = () =>
  useChatStore((s) => s.sendAttachmentMessage);
export const useIsUploadingAttachment = () =>
  useChatStore((s) => s.uploadingAttachmentCount > 0);

// ---------- Composer (staged, not-yet-sent attachments) ----------

export const useStagedFiles = () => useChatStore((s) => s.stagedFiles);
export const useHasStagedFiles = () =>
  useChatStore((s) => s.stagedFiles.length > 0);
export const useAddStagedFiles = () => useChatStore((s) => s.addStagedFiles);
export const useRemoveStagedFile = () =>
  useChatStore((s) => s.removeStagedFile);
export const useClearStagedFiles = () =>
  useChatStore((s) => s.clearStagedFiles);

// ---------- Friendships ----------

export const useSearchUsersState = () =>
  useChatStore(
    useShallow((s) => ({
      query: s.searchQuery,
      results: s.searchResults,
      status: s.searchStatus,
      error: s.searchError,
    }))
  );

export const useSearchUsers = () => useChatStore((s) => s.searchUsers);
export const useSendFriendRequest = () =>
  useChatStore((s) => s.sendFriendRequest);
export const useIsSendingRequestTo = (userId: string) =>
  useChatStore((s) => s.sendingRequestTo.has(userId));

export const usePendingRequests = () =>
  useChatStore(
    useShallow((s) => ({
      sent: s.sentPending,
      received: s.receivedPending,
      status: s.pendingStatus,
      error: s.pendingError,
    }))
  );

export const useFetchPendingRequests = () =>
  useChatStore((s) => s.fetchPendingRequests);
export const useAcceptFriendRequest = () =>
  useChatStore((s) => s.acceptFriendRequest);
export const useRejectFriendRequest = () =>
  useChatStore((s) => s.rejectFriendRequest);
export const useIsAcceptingFrom = (userId: string) =>
  useChatStore((s) => s.acceptingRequestFrom.has(userId));
export const useIsRejectingFrom = (userId: string) =>
  useChatStore((s) => s.rejectingRequestFrom.has(userId));

// ---------- Socket ----------

export const useIsSocketConnected = () =>
  useChatStore((s) => s.isSocketConnected);

// ---------- Groups ----------

export const useGroupSearchState = () =>
  useChatStore(
    useShallow((s) => ({
      query: s.groupSearchQuery,
      results: s.groupSearchResults,
      status: s.groupSearchStatus,
      error: s.groupSearchError,
    }))
  );

export const useSearchUsersForGroup = () =>
  useChatStore((s) => s.searchUsersForGroup);

export const useDraftGroupName = () => useChatStore((s) => s.draftGroupName);
export const useSetDraftGroupName = () =>
  useChatStore((s) => s.setDraftGroupName);

export const useDraftMembers = (): SearchUser[] =>
  useChatStore(useShallow((s) => Array.from(s.draftMembers.values())));

export const useAddDraftMember = () => useChatStore((s) => s.addDraftMember);
export const useRemoveDraftMember = () =>
  useChatStore((s) => s.removeDraftMember);
export const useResetGroupDraft = () => useChatStore((s) => s.resetGroupDraft);

export const useCreateGroup = () => useChatStore((s) => s.createGroup);
export const useCreatingGroup = () => useChatStore((s) => s.creatingGroup);

export const useInviteToGroup = () => useChatStore((s) => s.inviteToGroup);
export const useIsInvitingToGroup = (roomId: string, inviteeId: string) =>
  useChatStore((s) => s.invitingToGroup.has(`${roomId}:${inviteeId}`));

export const useUpdateGroup = () => useChatStore((s) => s.updateGroup);
export const useUpdatingGroup = () => useChatStore((s) => s.updatingGroup);

export const usePromoteGroupMember = () =>
  useChatStore((s) => s.promoteGroupMember);
export const useIsPromotingMember = (roomId: string, userId: string) =>
  useChatStore((s) => s.promotingMember.has(`${roomId}:${userId}`));

export const useGroupInvitesState = () =>
  useChatStore(
    useShallow((s) => ({
      invites: s.groupInvites,
      status: s.groupInvitesStatus,
      error: s.groupInvitesError,
    }))
  );

export const useFetchGroupInvites = () =>
  useChatStore((s) => s.fetchGroupInvites);

export const useSelectedGroupInviteId = () =>
  useChatStore((s) => s.selectedGroupInviteId);

export const useSelectedGroupInvite = () =>
  useChatStore(
    (s) => s.groupInvites.find((i) => i.id === s.selectedGroupInviteId) ?? null
  );

export const useSelectGroupInvite = () =>
  useChatStore((s) => s.selectGroupInvite);

export const useAcceptGroupInvite = () =>
  useChatStore((s) => s.acceptGroupInviteAction);

export const useRejectGroupInvite = () =>
  useChatStore((s) => s.rejectGroupInviteAction);

export const useIsAcceptingGroupInvite = (inviteId: string) =>
  useChatStore((s) => s.acceptingInviteId === inviteId);

export const useIsRejectingGroupInvite = (inviteId: string) =>
  useChatStore((s) => s.rejectingInviteId === inviteId);
