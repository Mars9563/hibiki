// ============================================================
// lib/types.ts
// Single source of truth for shared shapes across the app.
// ============================================================

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ---------- User ----------

export type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  status: string | null;
};

// ---------- Messages ----------


export type MessageStatus = 'pending' | 'sent' | 'received' | 'failed';

export type AttachmentType = 'image' | 'video' | 'audio' | 'pdf' | 'other';
export type MessageType = AttachmentType | 'text';

export type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  attachmentType: AttachmentType;
  url: string;
  // Small WebP preview for image bubbles (server-generated). Absent on
  // optimistic/pending sends and on images uploaded before thumbnails
  // existed — callers fall back to `url` in both cases.
  thumbnailUrl?: string | null;
};

export type MessageStructure = {
  id: string;
  sender_id: string;
  room_id: string;
  created_at: string;
  content: string | null; // was: string — file-only messages have no caption
  message_type: MessageType; // new
  attachments: Attachment[]; // new — [] for text messages
};

export type MessageEntry = {
  message: MessageStructure;
  clientTempId: string | null;
  status: MessageStatus;
};

// Per-room paginated message state
export type RoomMessageState = {
  items: Map<string, MessageEntry>; // keyed by message.id (or clientTempId while pending)
  cursor: string | null; // created_at of the oldest loaded message; null = nothing loaded yet
  hasMore: boolean;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  error: string | null;
};

// ---------- Rooms ----------
export type DirectChatRoom = {
  roomId: string;
  roomType: 'direct';
  currentUserId: string;
  otherUserId: string;
  otherUser: {
    id: string;
    fullName: string | null;
    username: string;
    avatarUrl: string | null;
    status: string | null; // new
  };
};

export type ParticipantRole = 'admin' | 'member';

export type GroupMember = {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  status: string | null; // new
  role: ParticipantRole;
};

export type GroupChatRoom = {
  roomId: string;
  roomType: 'group';
  currentUserId: string;
  currentUserRole: ParticipantRole;
  name: string;
  avatarUrl: string | null;
  description: string | null; // new
  members: GroupMember[];
};

export type ChatRoom = DirectChatRoom | GroupChatRoom;

export type GroupInviteStatus = 'pending' | 'accepted' | 'rejected';

export type PendingGroupInvite = {
  id: string;
  status: GroupInviteStatus;
  created_at: string;
  room_id: string;
  inviter_id: string;
  invitee_id: string;
  room: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  inviter: Profile;
};
export type GroupInviteRosterEntry = {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  status: 'accepted' | 'pending';
};

export type PendingGroupInviteWithRoster = PendingGroupInvite & {
  roster: GroupInviteRosterEntry[];
};

// ---------- Friendships ----------

export type FriendshipStatus = 'pending' | 'accepted';

export type PendingFriendship = {
  id: string;
  status: FriendshipStatus;
  created_at: string;
  requester_id: string;
  addressee_id: string;
  requester: Profile;
  addressee: Profile;
};

export type SearchUser = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
};

// ---------- UI ----------

export type ViewMode = 'rooms' | 'userpanel';
