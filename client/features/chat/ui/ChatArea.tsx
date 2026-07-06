'use client';
import { useHasStagedFiles, useSelectedRoom } from '@/store/selectors';
import { AttachmentPreview } from './AttachmentPreview';
import { ChatInput } from './ChatInput';
import { MessageArea } from './MessageArea';
import { TopBar } from './TopBar';

export function ChatArea() {
  const selectedRoom = useSelectedRoom();
  const hasStagedFiles = useHasStagedFiles();

  if (!selectedRoom) {
    return (
      <div className="hidden md:flex md:flex-1 items-center justify-center w-full h-full bg-background">
        <p className="font-ui text-lg text-foreground">
          Select a chat to start messaging
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center items-center w-full h-full min-h-0 min-w-0 bg-background">
      <TopBar />
      {/* Staging attachments takes over the message list, WhatsApp-style:
          TopBar + this preview + the ChatInput (as the caption box). */}
      {hasStagedFiles ? <AttachmentPreview /> : <MessageArea />}
      <ChatInput />
    </div>
  );
}
