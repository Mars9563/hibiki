'use client';
import { Button } from '@/components/ui/button';
import { useSelectedRoom, useSetSidePanelOpen } from '@/store/selectors';
import Image from 'next/image';
import { RiCloseFill } from 'react-icons/ri';
export function ChatRoomView() {
  const selectedRoom = useSelectedRoom();
  const setSidePanelOpen = useSetSidePanelOpen();
  if (selectedRoom === null) {
    return <div className="w-full h-full bg-red-600" />;
  }
  const isDirect = selectedRoom.roomType === 'direct';
  const fullName = isDirect ? selectedRoom.otherUser.fullName : '';
  const userName = isDirect ? selectedRoom.otherUser.username : '';
  const status = isDirect ? selectedRoom.otherUser.status : '';
  const avatarUrl = isDirect ? selectedRoom.otherUser.avatarUrl : '';
  return (
    <div className="w-full font-chat h-full">
      <div className="h-17 w-full flex flex-row justify-start items-center gap-4">
        <Button
          className=""
          variant={'ghost'}
          type="button"
          onClick={() => {
            setSidePanelOpen(false);
          }}
        >
          <RiCloseFill />
        </Button>{' '}
        <span>User Info</span>
      </div>
      <div className="flex-1 w-full flex flex-col justify- items-center p-4">
        <div className="flex flex-col justify-center items-center">
          <Image
            src={avatarUrl ?? ''}
            alt="User profile picture"
            width={128}
            height={128}
            className="rounded-full border"
          />
          <p className="mt-2 p-2 text-2xl">{fullName}</p>
          <p className="px-2 text-xl text-muted-foreground">@{userName}</p>
        </div>
        {status && (
          <div className="flex flex-col justify-center items-center w-full mt-4">
            <div className="flex flex-col justify-center items-start w-full">
              <p className="text-muted-foreground">Status</p>
              <p className="py-2">{status}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
