'use client';

import { useEffect } from 'react';
import { Check, X, Loader2, UsersRound } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  useGroupInvitesState,
  useFetchGroupInvites,
  useSelectedGroupInviteId,
  useSelectedGroupInvite,
  useSelectGroupInvite,
  useAcceptGroupInvite,
  useRejectGroupInvite,
  useIsAcceptingGroupInvite,
  useIsRejectingGroupInvite,
} from '@/store/selectors';
import type { GroupInviteRosterEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

interface GroupInvitesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GroupInvitesDialog({
  open,
  onOpenChange,
}: GroupInvitesDialogProps) {
  const { invites, status, error } = useGroupInvitesState();
  const fetchInvites = useFetchGroupInvites();
  const selectedId = useSelectedGroupInviteId();
  const selected = useSelectedGroupInvite();
  const selectInvite = useSelectGroupInvite();
  const acceptInvite = useAcceptGroupInvite();
  const rejectInvite = useRejectGroupInvite();

  // Fetch fresh every time the dialog opens, same as PendingRequests
  // does implicitly via its own mount-time fetch pattern.
  useEffect(() => {
    if (open) fetchInvites();
  }, [open, fetchInvites]);

  async function handleAccept(inviteId: string, roomName: string) {
    try {
      await acceptInvite(inviteId);
      toast.success(`Joined ${roomName}`);
    } catch {
      toast.error('Failed to accept invite');
    }
  }

  async function handleReject(inviteId: string, roomName: string) {
    try {
      await rejectInvite(inviteId);
      toast.success(`Declined invite to ${roomName}`);
    } catch {
      toast.error('Failed to decline invite');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="@container flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">Group invites</DialogTitle>

        <div className="grid min-h-0 flex-1 grid-cols-1 @2xl:grid-cols-[1fr_1px_1fr]">
          {/* Left pane: invites received */}
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
            <div className="border-b px-5 py-4">
              <p className="text-sm font-semibold text-foreground">
                Group invites
              </p>
            </div>

            <div className="min-h-0">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-1 p-3">
                  {status === 'loading' && (
                    <EmptyState
                      icon={<Loader2 className="size-4 animate-spin" />}
                      text="Loading invites..."
                    />
                  )}
                  {status === 'error' && (
                    <EmptyState text={error ?? 'Failed to load invites'} />
                  )}
                  {status === 'success' && invites.length === 0 && (
                    <EmptyState text="No pending group invites." />
                  )}

                  {status === 'success' &&
                    invites.map((invite) => (
                      <InviteRow
                        key={invite.id}
                        inviteId={invite.id}
                        roomName={invite.room.name}
                        avatarUrl={invite.room.avatar_url}
                        isSelected={invite.id === selectedId}
                        onSelect={() => selectInvite(invite.id)}
                        onAccept={() =>
                          handleAccept(invite.id, invite.room.name)
                        }
                        onReject={() =>
                          handleReject(invite.id, invite.room.name)
                        }
                      />
                    ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="h-px w-full bg-border @2xl:h-full @2xl:w-px" />

          {/* Right pane: roster for the selected invite */}
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
            <div className="border-b px-5 py-4">
              <p className="truncate text-sm font-semibold text-foreground">
                {selected ? selected.room.name : 'Group members'}
              </p>
            </div>

            <div className="min-h-0">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-1 p-3">
                  {!selected && (
                    <EmptyState
                      icon={<UsersRound className="size-4" />}
                      text="Select an invite to view group members."
                    />
                  )}

                  {selected?.roster.map((member) => (
                    <RosterRow key={member.userId} member={member} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InviteRow({
  inviteId,
  roomName,
  avatarUrl,
  isSelected,
  onSelect,
  onAccept,
  onReject,
}: {
  inviteId: string;
  roomName: string;
  avatarUrl: string | null;
  isSelected: boolean;
  onSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const isAccepting = useIsAcceptingGroupInvite(inviteId);
  const isRejecting = useIsRejectingGroupInvite(inviteId);
  const isBusy = isAccepting || isRejecting;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        isSelected ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted'
      )}
    >
      <Avatar size="lg">
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback>
          <UsersRound className="size-4" />
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {roomName}
        </p>
      </div>

      <div
        className="flex shrink-0 items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          size="icon-sm"
          variant="outline"
          disabled={isBusy}
          onClick={onReject}
          aria-label="Decline invite"
        >
          {isRejecting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
        </Button>

        <Button
          size="icon-sm"
          disabled={isBusy}
          onClick={onAccept}
          aria-label="Accept invite"
        >
          {isAccepting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
        </Button>
      </div>
    </button>
  );
}

function RosterRow({ member }: { member: GroupInviteRosterEntry }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <Avatar size="lg">
        <AvatarImage src={member.avatarUrl ?? undefined} />
        <AvatarFallback>
          {member.fullName?.slice(0, 2)?.toUpperCase() ?? 'U'}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {member.fullName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          @{member.username}
        </p>
      </div>

      <span
        className={cn(
          'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
          member.status === 'accepted'
            ? 'bg-emerald-500/10 text-emerald-600'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {member.status === 'accepted' ? 'Accepted' : 'Pending'}
      </span>
    </div>
  );
}

function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
      {icon}
      <span>{text}</span>
    </div>
  );
}
