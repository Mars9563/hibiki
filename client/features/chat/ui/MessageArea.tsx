import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './MessageBubble';
import { DateSeparator } from './dateSeperator';
import { useEffect, useRef } from 'react';
import { isToday, isYesterday, format } from 'date-fns';
import {
  useSelectedRoom,
  useMessagesForRoom,
  useRoomMessageMeta,
  useLoadMoreMessages,
} from '@/store/selectors';
import { FaUserLarge } from 'react-icons/fa6';

function getDateLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'd/M/yyyy');
}

export function MessageArea() {
  const selectedRoom = useSelectedRoom();
  const roomId = selectedRoom?.roomId ?? null;

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isLoadingOlderRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const previousMessageCountRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);

  const messageEntries = useMessagesForRoom(roomId);
  const { hasMore, isLoadingMore } = useRoomMessageMeta(roomId);
  const loadMoreMessages = useLoadMoreMessages();

  function getViewport() {
    return scrollContainerRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;
  }

  useEffect(() => {
    const viewport = getViewport();

    if (!viewport) return;

    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

      shouldAutoScrollRef.current = distanceFromBottom < 200;
    };

    viewport.addEventListener('scroll', handleScroll);

    handleScroll();

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: 'auto',
      });

      previousMessageCountRef.current = messageEntries.length;
    });
  }, [roomId]);

  useEffect(() => {
    if (!isLoadingOlderRef.current) return;

    const viewport = getViewport();

    if (!viewport) return;

    requestAnimationFrame(() => {
      const newHeight = viewport.scrollHeight;

      const diff = newHeight - previousScrollHeightRef.current;

      viewport.scrollTop += diff;

      isLoadingOlderRef.current = false;

      previousMessageCountRef.current = messageEntries.length;
    });
  }, [messageEntries.length]);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const currentCount = messageEntries.length;

    if (currentCount <= previousCount) {
      previousMessageCountRef.current = currentCount;
      return;
    }

    if (isLoadingOlderRef.current) {
      previousMessageCountRef.current = currentCount;
      return;
    }

    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({
        behavior: 'smooth',
      });
    }

    previousMessageCountRef.current = currentCount;
  }, [messageEntries.length]);

  function handleLoadMore() {
    if (!roomId || !hasMore || isLoadingMore) return;

    const viewport = getViewport();

    if (viewport) {
      previousScrollHeightRef.current = viewport.scrollHeight;
      isLoadingOlderRef.current = true;
    }

    loadMoreMessages(roomId);
  }

  const items: (
    | { type: 'separator'; label: string; key: string }
    | { type: 'message'; entry: (typeof messageEntries)[number] }
  )[] = [];

  let lastDateLabel: string | null = null;

  for (const entry of messageEntries) {
    const date = new Date(entry.message.created_at);
    const label = getDateLabel(date);

    if (label !== lastDateLabel) {
      items.push({
        type: 'separator',
        label,
        key: `sep-${label}`,
      });

      lastDateLabel = label;
    }

    items.push({
      type: 'message',
      entry,
    });
  }

  const isGroup = selectedRoom?.roomType === 'group';

  return (
    <div className="relative flex flex-col h-full min-h-0 min-w-0 w-full">
      <div ref={scrollContainerRef} className="h-full">
        <ScrollArea className="h-full p-4 relative z-10">
          {hasMore && (
            <div className="flex justify-center pb-3">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="font-chat text-xs px-3 py-1.5 border text-muted-foreground hover:opacity-80 disabled:opacity-50 rounded-2xl"
              >
                {isLoadingMore ? 'Loading...' : 'Load older messages'}
              </button>
            </div>
          )}

          {items.map((item) =>
            item.type === 'separator' ? (
              <DateSeparator key={item.key} date={item.label} />
            ) : (
              <MessageBubble
                key={item.entry.message.id}
                content={item.entry.message.content}
                attachments={item.entry.message.attachments ?? []}
                senderId={item.entry.message.sender_id}
                currentUserId={selectedRoom?.currentUserId ?? ''}
                messageType={item.entry.message.message_type}
                avatarUrl={
                  isGroup
                    ? selectedRoom?.members.find(
                        (member) => member.id == item.entry.message.sender_id
                      )?.avatarUrl
                    : selectedRoom?.otherUser.avatarUrl
                }
                fallback={isGroup ? <FaUserLarge /> : <FaUserLarge />}
                status={item.entry.status}
                createdAt={item.entry.message.created_at}
              />
            )
          )}

          <div ref={bottomRef} />
        </ScrollArea>
      </div>
    </div>
  );
}
