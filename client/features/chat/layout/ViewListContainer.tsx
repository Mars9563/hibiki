'use client';

import { useViewMode, useSelectedRoom } from '@/store/selectors';
import { cn } from '@/lib/utils';
import { RoomsList } from '../rooms/RoomsList';
import { UserSettings } from '../userpanel/UserSettings';

export function ViewListContainer() {
  const viewMode = useViewMode();
  const selectedRoom = useSelectedRoom();

  return (
    <div
      className={cn(
        'h-full min-h-0 min-w-0 w-full overflow-hidden border-r bg-card md:w-25/100',
        selectedRoom ? 'hidden md:block' : 'block'
      )}
    >
      {viewMode === 'rooms' && <RoomsList />}
      {viewMode === 'userpanel' && <UserSettings />}
    </div>
  );
}
