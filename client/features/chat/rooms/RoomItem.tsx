'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSelectRoom, useSelectedRoom } from '@/store/selectors';
import { cn } from '@/lib/utils';
import { ChatRoom } from '@/lib/types';
import { FaUserLarge } from 'react-icons/fa6';

interface RoomItemProps {
  room: ChatRoom;
  onClick?: () => void;
}

export function RoomItem({ room, onClick }: RoomItemProps) {
  const selectRoom = useSelectRoom();
  const selectedRoom = useSelectedRoom();
  const isActive = selectedRoom?.roomId === room.roomId;

  const displayName =
    room.roomType === 'direct'
      ? (room.otherUser.fullName ?? room.otherUser.username)
      : room.name;

  const subtitle =
    room.roomType === 'direct'
      ? `@${room.otherUser.username}`
      : `${room.members.length} members`;

  const avatarUrl =
    room.roomType === 'direct' ? room.otherUser.avatarUrl : room.avatarUrl;

  const initials = <FaUserLarge />;

  return (
    <button
      type="button"
      onClick={() => {
        selectRoom(room.roomId);
        onClick?.();
      }}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
        isActive ? 'bg-primary/10' : 'hover:bg-muted'
      )}
    >
      <Avatar className="size-11 shrink-0">
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback className="bg-accent text-accent-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            isActive ? 'text-primary' : 'text-foreground'
          )}
        >
          {displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}
