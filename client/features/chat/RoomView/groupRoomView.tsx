'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RiCloseFill } from 'react-icons/ri';
import {
  UsersRound,
  Search as SearchIcon,
  UserPlus,
  Pencil,
  Shield,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useSelectedRoom,
  useSetSidePanelOpen,
  usePromoteGroupMember,
  useIsPromotingMember,
} from '@/store/selectors';
import type { GroupMember } from '@/lib/types';
import { AddParticipantDialog } from '../groups/AddParticipantDialog';
import { EditGroupDialog } from '../groups/EditGroupDialog';

export function GroupRoomView() {
  const selectedRoom = useSelectedRoom();
  const setSidePanelOpen = useSetSidePanelOpen();

  const [memberQuery, setMemberQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // RoomView only mounts this for group rooms; the guard also narrows
  // the union so the group-only fields below are accessible.
  if (selectedRoom === null || selectedRoom.roomType !== 'group') {
    return null;
  }

  const {
    roomId,
    name,
    avatarUrl,
    description,
    members,
    currentUserId,
    currentUserRole,
  } = selectedRoom;
  const isAdmin = currentUserRole === 'admin';

  const q = memberQuery.trim().toLowerCase();
  const visibleMembers = (
    q
      ? members.filter(
          (m) =>
            (m.fullName ?? '').toLowerCase().includes(q) ||
            m.username.toLowerCase().includes(q)
        )
      : members
  )
    .slice()
    // Admins first, then alphabetical by display name.
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      return (a.fullName ?? a.username).localeCompare(b.fullName ?? b.username);
    });

  return (
    <div className="flex h-full w-full flex-col font-chat">
      {/* header */}
      <div className="flex h-17 shrink-0 items-center gap-2 px-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() => setSidePanelOpen(false)}
          aria-label="Close"
        >
          <RiCloseFill />
        </Button>
        <span>Group Info</span>
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto mr-2"
            onClick={() => setEditOpen(true)}
            aria-label="Edit group"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>

      {/* group identity */}
      <div className="flex flex-col items-center gap-1 border-b border-border px-4 pb-5">
        <Avatar className="size-28 border">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback>
            <UsersRound className="size-10" />
          </AvatarFallback>
        </Avatar>
        <p className="mt-2 text-center text-2xl">{name}</p>
        {description && (
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {/* members */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <UserPlus className="size-4" />
              Add
            </Button>
          )}
        </div>

        <div className="px-4 pb-2">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Search members"
              autoComplete="off"
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-2">
          <div className="flex flex-col gap-0.5 pb-4">
            {visibleMembers.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No members found.
              </p>
            )}
            {visibleMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                roomId={roomId}
                isCurrentUser={member.id === currentUserId}
                canPromote={isAdmin && member.role !== 'admin'}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <AddParticipantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        roomId={roomId}
        existingMemberIds={new Set(members.map((m) => m.id))}
      />
      <EditGroupDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        roomId={roomId}
        currentName={name}
        currentDescription={description}
        currentAvatarUrl={avatarUrl}
      />
    </div>
  );
}

function MemberRow({
  member,
  roomId,
  isCurrentUser,
  canPromote,
}: {
  member: GroupMember;
  roomId: string;
  isCurrentUser: boolean;
  canPromote: boolean;
}) {
  const promote = usePromoteGroupMember();
  const isPromoting = useIsPromotingMember(roomId, member.id);
  const displayName = member.fullName ?? member.username;

  async function handlePromote() {
    try {
      await promote(roomId, member.id);
      toast.success(`@${member.username} is now an admin`);
    } catch (err) {
      toast.error('Failed to promote member', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
      <Avatar size="lg">
        <AvatarImage src={member.avatarUrl ?? undefined} />
        <AvatarFallback>
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {displayName}
          {isCurrentUser && (
            <span className="font-normal text-muted-foreground"> (You)</span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          @{member.username}
        </p>
      </div>

      {member.role === 'admin' ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <Shield className="size-3" />
          Admin
        </span>
      ) : canPromote ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={isPromoting}
          onClick={handlePromote}
        >
          {isPromoting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            'Make admin'
          )}
        </Button>
      ) : null}
    </div>
  );
}
