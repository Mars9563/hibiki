'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Search as SearchIcon, Loader2, UserPlus, Check } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  useGroupSearchState,
  useSearchUsersForGroup,
  useInviteToGroup,
  useIsInvitingToGroup,
} from '@/store/selectors';
import type { SearchUser } from '@/lib/types';

interface AddParticipantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  existingMemberIds: Set<string>;
}

export function AddParticipantDialog({
  open,
  onOpenChange,
  roomId,
  existingMemberIds,
}: AddParticipantDialogProps) {
  const searchUsers = useSearchUsersForGroup();

  // The group search state is shared with Create Group; clear it on
  // close so reopening (here or there) starts fresh.
  function handleOpenChange(next: boolean) {
    if (!next) searchUsers('');
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[80vh] flex-col sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Add participant</DialogTitle>
        </DialogHeader>
        {open && (
          <AddParticipantBody
            roomId={roomId}
            existingMemberIds={existingMemberIds}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddParticipantBody({
  roomId,
  existingMemberIds,
}: {
  roomId: string;
  existingMemberIds: Set<string>;
}) {
  const { query, results, status } = useGroupSearchState();
  const searchUsers = useSearchUsersForGroup();
  const inviteToGroup = useInviteToGroup();

  // Users invited this session — invitees don't become members until
  // they accept, so we mark them locally to avoid re-inviting.
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  async function handleInvite(user: SearchUser) {
    try {
      await inviteToGroup(roomId, user.id);
      setInvitedIds((prev) => new Set(prev).add(user.id));
      toast.success(`Invite sent to @${user.username}`);
    } catch (err) {
      toast.error('Failed to send invite', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  const isLoading = status === 'loading';
  const trimmed = query.trim();
  // Hide anyone already in the group — invitees only need people who
  // aren't members yet.
  const addableUsers = results.filter((u) => !existingMemberIds.has(u.id));

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => searchUsers(e.target.value)}
          placeholder="Search by username"
          autoComplete="off"
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-80">
        <div className="flex flex-col gap-1 pr-2">
          {isLoading && (
            <EmptyState
              icon={<Loader2 className="size-4 animate-spin" />}
              text="Searching..."
            />
          )}
          {!isLoading && trimmed.length < 2 && (
            <EmptyState text="Search for people to add." />
          )}
          {!isLoading && trimmed.length >= 2 && addableUsers.length === 0 && (
            <EmptyState text="No users found." />
          )}

          {!isLoading &&
            addableUsers.map((user) => (
              <ResultRow
                key={user.id}
                user={user}
                roomId={roomId}
                invited={invitedIds.has(user.id)}
                onInvite={() => handleInvite(user)}
              />
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function ResultRow({
  user,
  roomId,
  invited,
  onInvite,
}: {
  user: SearchUser;
  roomId: string;
  invited: boolean;
  onInvite: () => void;
}) {
  const busy = useIsInvitingToGroup(roomId, user.id);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <Avatar size="lg">
        <AvatarImage src={user.avatar_url ?? undefined} />
        <AvatarFallback>
          {user.full_name?.slice(0, 2)?.toUpperCase() ?? 'U'}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {user.full_name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          @{user.username}
        </p>
      </div>

      {invited ? (
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
          <Check className="size-3.5" /> Invited
        </span>
      ) : (
        <Button
          size="icon-sm"
          variant="outline"
          disabled={busy}
          onClick={onInvite}
          aria-label={`Invite ${user.username}`}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}

function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
      {icon}
      <span>{text}</span>
    </div>
  );
}
