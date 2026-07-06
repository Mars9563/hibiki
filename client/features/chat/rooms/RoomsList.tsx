import { ScrollArea } from '@/components/ui/scroll-area';
import { RoomItem } from './RoomItem';
import { ChatRoom } from '@/lib/types';
import { MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import {
  useRoomsList,
  useRoomsStatus,
  useSetMobileSidebarOpen,
} from '@/store/selectors';

export function RoomsList() {
  const rooms = useRoomsList();
  const { status, error } = useRoomsStatus();
  const setMobileSidebarOpen = useSetMobileSidebarOpen();

  return (
    <div className="grid h-full min-h-0 w-full min-w-0 grid-rows-[auto_1fr] font-chat">
      <div className="border-b px-4 py-4.5 flex flex-row justify-between items-center h-17">
        <Button
          size="icon"
          variant="outline"
          className="md:hidden"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </Button>
        <p className="text-2xl font-semibold text-foreground">Chats</p>
      </div>

      <div className="min-h-0 w-full min-w-0">
        {status === 'loading' && (
          <StateMessage
            icon={<Loader2 className="size-5 animate-spin" />}
            text="Loading chats..."
          />
        )}

        {status === 'error' && (
          <StateMessage text={error ?? 'Something went wrong'} />
        )}

        {status === 'success' && rooms.length === 0 && (
          <StateMessage
            icon={<MessageSquare className="size-5" />}
            text="No chats yet"
            subtext="Accept a friend request to start a conversation."
          />
        )}

        {status === 'success' && rooms.length > 0 && (
          <ScrollArea className="h-full w-full min-h-0 min-w-0">
            <div className="flex flex-col gap-0.5 p-2">
              {rooms.map((room: ChatRoom) => (
                <RoomItem key={room.roomId} room={room} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function StateMessage({
  icon,
  text,
  subtext,
}: {
  icon?: React.ReactNode;
  text: string;
  subtext?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <p className="text-sm text-muted-foreground">{text}</p>
      {subtext && <p className="text-xs text-muted-foreground/70">{subtext}</p>}
    </div>
  );
}
