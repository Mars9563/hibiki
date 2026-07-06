'use client';

import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { toast } from 'sonner';
import { Search as SearchIcon, UserPlus, Loader2 } from 'lucide-react';

import { Field, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  useSearchUsersState,
  useSearchUsers,
  useSendFriendRequest,
  useIsSendingRequestTo,
} from '@/store/selectors';

const formData = z.object({
  search: z.string().trim().min(1, 'Search cannot be empty'),
});

export function Search() {
  const form = useForm<z.infer<typeof formData>>({
    resolver: zodResolver(formData),
    defaultValues: { search: '' },
  });

  const { query, results, status, error } = useSearchUsersState();
  const searchUsers = useSearchUsers();
  const sendFriendRequest = useSendFriendRequest();

  const isLoading = status === 'loading';

  async function handleSearch(data: z.infer<typeof formData>) {
    await searchUsers(data.search.trim());
  }

  // Fire the toast once when status flips to 'error', not on every
  // render — same guard the original component had via isError+useEffect.
  useEffect(() => {
    if (status === 'error' && error) {
      toast.error('Search failed', { description: error });
    }
  }, [status, error]);

  async function handleSend(userId: string) {
    try {
      await sendFriendRequest(userId);
    } catch (err: any) {
      toast.error('Request failed', {
        description: err?.message || 'Could not send request',
      });
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
      {/* Search input */}
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <form
          onSubmit={form.handleSubmit(handleSearch)}
          id="searchForm"
          className="flex-1"
        >
          <FieldGroup>
            <Controller
              name="search"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <Input
                    {...field}
                    type="text"
                    placeholder="Search by username"
                    autoComplete="off"
                  />
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <Button
          disabled={isLoading}
          type="submit"
          form="searchForm"
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SearchIcon className="size-4" />
          )}
        </Button>
      </div>

      {/* Results */}
      <div className="min-h-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-1 p-3">
            {!isLoading && results.length === 0 && query.trim().length >= 2 && (
              <EmptyState text="No users found" />
            )}

            {!isLoading && results.length === 0 && query.trim().length < 2 && (
              <EmptyState text="Search results will be displayed here." />
            )}

            {isLoading && (
              <EmptyState
                text="Searching..."
                icon={<Loader2 className="size-4 animate-spin" />}
              />
            )}

            {!isLoading &&
              results.map((user) => (
                <SearchResultRow
                  key={user.id}
                  userId={user.id}
                  fullName={user.full_name}
                  username={user.username}
                  avatarUrl={user.avatar_url}
                  onSend={() => handleSend(user.id)}
                />
              ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Own component so each row's "sending..." state only re-renders that
// row, not the whole results list.
function SearchResultRow({
  userId,
  fullName,
  username,
  avatarUrl,
  onSend,
}: {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  onSend: () => void;
}) {
  const isSending = useIsSendingRequestTo(userId);

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

      <Button
        size="icon-sm"
        variant="outline"
        disabled={isSending}
        onClick={onSend}
        aria-label="Send friend request"
      >
        {isSending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UserPlus className="size-4" />
        )}
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
