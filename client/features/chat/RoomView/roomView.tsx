'use client';
import { useSelectedRoom, useSidePanelOpen } from '@/store/selectors';
import { GroupRoomView } from './groupRoomView';
import { ChatRoomView } from './chatRoomView';

export function RoomView() {
  const selectedRoom = useSelectedRoom();
  const sidePanelOpen = useSidePanelOpen();
  if (selectedRoom === null || !sidePanelOpen) {
    return null;
  }
  const isGroup = selectedRoom.roomType === 'group';

  return (
    <div className="fixed inset-0 z-40 w-full h-full bg-card md:static md:inset-auto md:z-auto md:w-125">
      {isGroup ? <GroupRoomView /> : <ChatRoomView />}
    </div>
  );
}
