'use client';

import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  usePendingRequests,
  useAcceptFriendRequest,
  useRejectFriendRequest,
  useIsAcceptingFrom,
  useIsRejectingFrom,
} from '@/store/selectors';

export function PendingRequests() {
  const { sent, received, status, error } = usePendingRequests();
  const acceptFriendRequest = useAcceptFriendRequest();
  const rejectFriendRequest = useRejectFriendRequest();

  async function handleAccept(requesterId: string, fullName: string | null) {
    try {
      await acceptFriendRequest(requesterId);
      toast.success(`Accepted ${fullName ?? 'their'}'s request`);
    } catch {
      toast.error('Failed to accept request');
    }
  }

  async function handleReject(requesterId: string, fullName: string | null) {
    try {
      await rejectFriendRequest(requesterId);
      toast.success(`Rejected ${fullName ?? 'their'}'s request`);
    } catch {
      toast.error('Failed to reject request');
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>Loading requests...</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        {error ?? 'Failed to load requests'}
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto_1fr]">
      {/* RECEIVED HEADER */}
      <div className="border-b px-5 py-4">
        <p className="text-sm font-semibold text-foreground">
          Received requests
        </p>
      </div>

      <div className="min-h-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-1 p-3">
            {received.length === 0 ? (
              <EmptyState text="No requests found." />
            ) : (
              received.map((req) => (
                <ReceivedRow
                  key={req.id}
                  requesterId={req.requester.id}
                  fullName={req.requester.full_name}
                  username={req.requester.username}
                  avatarUrl={req.requester.avatar_url}
                  onAccept={() =>
                    handleAccept(req.requester.id, req.requester.full_name)
                  }
                  onReject={() =>
                    handleReject(req.requester.id, req.requester.full_name)
                  }
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* SENT HEADER */}
      <div className="border-y px-5 py-4">
        <p className="text-sm font-semibold text-foreground">Sent requests</p>
      </div>

      <div className="min-h-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-1 p-3">
            {sent.length === 0 ? (
              <EmptyState text="No requests found." />
            ) : (
              sent.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
                >
                  <Avatar size="lg">
                    <AvatarImage src={req.addressee.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {req.addressee.full_name?.slice(0, 2)?.toUpperCase() ??
                        'U'}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {req.addressee.full_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{req.addressee.username}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Pending
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Pulled into its own component so each row can read its own
// accepting/rejecting flag from the store without re-rendering
// every other row in the list.
function ReceivedRow({
  requesterId,
  fullName,
  username,
  avatarUrl,
  onAccept,
  onReject,
}: {
  requesterId: string;
  fullName: string | null;
  username: string;
  avatarUrl: string | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  const isAccepting = useIsAcceptingFrom(requesterId);
  const isRejecting = useIsRejectingFrom(requesterId);
  const isBusy = isAccepting || isRejecting;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <Avatar size="lg">
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback>
          {fullName?.slice(0, 2)?.toUpperCase() ?? 'U'}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {fullName}
        </p>
        <p className="truncate text-xs text-muted-foreground">@{username}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="icon-sm"
          variant="outline"
          disabled={isBusy}
          onClick={onReject}
          aria-label="Reject request"
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
          aria-label="Accept request"
        >
          {isAccepting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
