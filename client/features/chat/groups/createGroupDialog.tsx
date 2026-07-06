'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { Search as SearchIcon, X, Loader2, UsersRound } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  useGroupSearchState,
  useSearchUsersForGroup,
  useDraftGroupName,
  useSetDraftGroupName,
  useDraftMembers,
  useAddDraftMember,
  useRemoveDraftMember,
  useResetGroupDraft,
  useCreateGroup,
  useCreatingGroup,
} from '@/store/selectors';
import type { SearchUser } from '@/lib/types';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
}: CreateGroupDialogProps) {
  const { query, results, status } = useGroupSearchState();
  const searchUsers = useSearchUsersForGroup();

  const draftName = useDraftGroupName();
  const setDraftName = useSetDraftGroupName();

  const members = useDraftMembers();
  const addMember = useAddDraftMember();
  const removeMember = useRemoveDraftMember();
  const resetDraft = useResetGroupDraft();

  const createGroup = useCreateGroup();
  const creating = useCreatingGroup();

  const memberIds = new Set(members.map((m) => m.id));
  const isLoading = status === 'loading';

  // Reset the draft whenever the dialog is closed, so reopening it
  // always starts clean rather than showing the last attempt.
  useEffect(() => {
    if (!open) resetDraft();
  }, [open, resetDraft]);

  async function handleCreate() {
    if (!draftName.trim()) {
      toast.error('Group name is required');
      return;
    }
    if (members.length === 0) {
      toast.error('Add at least one person to the group');
      return;
    }

    try {
      await createGroup(draftName.trim(), Array.from(memberIds));
      toast.success('Group created');
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Failed to create group', {
        description: err?.message,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="@container flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">Create group</DialogTitle>

        <div className="grid min-h-0 flex-1 grid-cols-1 @2xl:grid-cols-[1fr_1px_1fr]">
          {/* Left pane: search + addable results */}
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
            <div className="flex items-center gap-2 border-b px-5 py-4">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => searchUsers(e.target.value)}
                  placeholder="Search by username"
                  autoComplete="off"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="min-h-0">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-1 p-3">
                  {!isLoading &&
                    results.length === 0 &&
                    query.trim().length >= 2 && (
                      <EmptyState text="No users found" />
                    )}
                  {!isLoading && query.trim().length < 2 && (
                    <EmptyState text="Search results will be displayed here." />
                  )}
                  {isLoading && (
                    <EmptyState
                      text="Searching..."
                      icon={<Loader2 className="size-4 animate-spin" />}
                    />
                  )}

                  {!isLoading &&
                    results
                      .filter((u) => !memberIds.has(u.id))
                      .map((user) => (
                        <ResultRow
                          key={user.id}
                          user={user}
                          onAdd={() => addMember(user)}
                        />
                      ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="h-px w-full bg-border @2xl:h-full @2xl:w-px" />

          {/* Right pane: group name + selected members */}
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
            <div className="flex items-center gap-3 border-b px-5 py-4">
              <span className="text-sm font-medium text-foreground shrink-0">
                Group name
              </span>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="New group name"
                autoComplete="off"
              />
            </div>

            <div className="min-h-0">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-1 p-3">
                  {members.length === 0 && (
                    <EmptyState
                      icon={<UsersRound className="size-4" />}
                      text="Add people from the left to build your group."
                    />
                  )}

                  {members.map((user) => (
                    <SelectedRow
                      key={user.id}
                      user={user}
                      onRemove={() => removeMember(user.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="border-t p-3">
              <Button
                className="w-full"
                disabled={creating}
                onClick={handleCreate}
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  'Create group'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({ user, onAdd }: { user: SearchUser; onAdd: () => void }) {
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

      <Button
        size="icon-sm"
        variant="outline"
        onClick={onAdd}
        aria-label="Add to group"
      >
        <UsersRound className="size-4" />
      </Button>
    </div>
  );
}

function SelectedRow({
  user,
  onRemove,
}: {
  user: SearchUser;
  onRemove: () => void;
}) {
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

      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onRemove}
        aria-label="Remove from group"
      >
        <X className="size-4" />
      </Button>
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
